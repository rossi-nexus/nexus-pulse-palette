// Scrape an actor's website for likely team/about/contact pages and use the
// LLM to extract individual contacts (name + optional title/email/phone/linkedin).
//
// Auth: JWT-gated. Caller must be admin or the actor's verifier_id.
// Dedup: skip contacts whose name (case-insensitive) already exists for this actor.
// Never overwrites manual rows (we only INSERT, never UPDATE).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (compatible; NEXUS-ContactScrape/1.0; +https://nexus.app)";
const FETCH_TIMEOUT_MS = 6_000;
// Hard cap on candidates probed so wall-time can't blow up on slow hosts.
// (Equipnor-style sites return ~5s per 404; sequential 30× would exceed Supabase wall-time.)
const MAX_CANDIDATES = 16;
// English + Norwegian (no/da/sv close enough) candidate paths.
const CANDIDATE_PATHS = [
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/leadership",
  "/people",
  "/contact",
  "/contacts",
  "/contact-us",
  "/staff",
  "/om-oss",
  "/om",
  "/medarbeidere",
  "/ansatte",
  "/folk",
  "/styret",
  "/ledelse",
  "/ledelsen",
  "/kontakt",
  "/kontakt-oss",
];
// Hint tokens used to recognize that a candidate page is actually a team/about/contact page.
const PAGE_HINT_TOKENS = [
  "team", "leadership", "contact", "people", "staff", "about",
  "om oss", "medarbeidere", "ansatte", "ledelse", "styret", "kontakt", "folk",
];
const MAX_CONTACTS = 20;
const MAX_TEXT_CHARS = 16_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripHtml(html: string): string {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  t = t
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
  return t
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(tm);
  }
}

interface CandidatePage { url: string; text: string; score: number; }

async function tryFetchPage(candidate: string): Promise<CandidatePage | null> {
  try {
    const resp = await fetchWithTimeout(candidate);
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("html") && !ct.includes("text/plain")) return null;
    const html = await resp.text();
    const text = stripHtml(html);
    if (text.length <= 200) return null;
    const lower = text.toLowerCase();
    const score = PAGE_HINT_TOKENS.reduce((n, tok) => n + (lower.includes(tok) ? 1 : 0), 0);
    const truncated = text.length > MAX_TEXT_CHARS
      ? text.slice(0, MAX_TEXT_CHARS) + "\n\n[Content truncated]"
      : text;
    return { url: candidate, text: truncated, score };
  } catch {
    return null;
  }
}

// Look at homepage HTML for <a> tags with team/about/contact-ish text and
// extract additional candidate URLs we may not have hardcoded.
async function discoverLinkedPages(baseUrl: string): Promise<string[]> {
  try {
    const resp = await fetchWithTimeout(baseUrl);
    if (!resp.ok) return [];
    const html = await resp.text();
    const out = new Set<string>();
    const re = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    // Match BOTH link text AND href path. Norwegian inflection (e.g. "Teamet",
    // "Om equipnor", "/om-equipnor/") routinely fails strict \bword\b tests on text alone.
    const TEXT_RE = /(team|leadership|people|staff|about|contact|kontakt|\bom[\s-]|medarbeider|ansatte|ledelse|styret|folk)/i;
    const HREF_RE = /\/(team|teamet|leadership|people|staff|about|contact|contacts|kontakt|kontakt-oss|om|om-oss|om-[a-z]+|medarbeider(?:e|ne)?|ansatte|ledelse(?:n)?|styret|folk)(?:\/|$)/i;
    while ((m = re.exec(html)) !== null) {
      const href = (m[2] ?? m[3] ?? "").trim();
      const inner = m[4].replace(/<[^>]+>/g, "").trim();
      if (!href) continue;
      if (!TEXT_RE.test(inner) && !HREF_RE.test(href)) continue;
      try {
        const u = new URL(href, baseUrl).href;
        if (new URL(u).host === new URL(baseUrl).host) out.add(u);
      } catch { /* skip */ }
    }
    return Array.from(out).slice(0, 12);
  } catch {
    return [];
  }
}

async function findTeamPage(baseUrl: string): Promise<CandidatePage | null> {
  // 1) Build candidate list: hardcoded paths + homepage-discovered links.
  const hardcoded: string[] = [];
  for (const path of CANDIDATE_PATHS) {
    try { hardcoded.push(new URL(path, baseUrl).href); } catch { /* skip */ }
  }
  const linked = await discoverLinkedPages(baseUrl);
  const linkedSet = new Set(linked);
  const candidates = Array.from(new Set([...linked, ...hardcoded])).slice(0, MAX_CANDIDATES);
  console.log(`[enrich-from-team-page] probing ${candidates.length} candidates (linked=${linked.length}, hardcoded=${hardcoded.length})`);

  // 2) Probe in parallel — sequential was hitting Supabase wall-time on slow hosts
  //    (~5s per 404 × 20+ candidates). Promise.all bounds wall-time to ~FETCH_TIMEOUT_MS.
  const results = await Promise.all(candidates.map(async (c) => ({ url: c, page: await tryFetchPage(c) })));
  let best: CandidatePage | null = null;
  for (const { url, page } of results) {
    if (!page) continue;
    // Linked URLs were already prefiltered by team-ish anchor text/href, so accept
    // them even when token-score is 0 (sparse SPA HTML on WordPress/Avada/etc.).
    const minScore = linkedSet.has(url) ? 0 : 1;
    if (page.score >= minScore && (best === null || page.score > best.score)) {
      best = page;
    }
  }
  if (best) console.log(`[enrich-from-team-page] best candidate ${best.url} score=${best.score} chars=${best.text.length}`);
  return best;
}

interface ScrapedContact {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
}

function tryParseLooseJson(raw: string): unknown {
  // Strip ``` fences, trailing commas; tolerate model preamble.
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Find first { or [
  const start = Math.min(
    ...["{", "["].map((c) => {
      const i = s.indexOf(c);
      return i < 0 ? Number.POSITIVE_INFINITY : i;
    }),
  );
  if (Number.isFinite(start)) s = s.slice(start);
  s = s.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function llmExtractContacts(
  pageText: string,
  pageUrl: string,
  lovableKey: string,
): Promise<ScrapedContact[]> {
  const TOOL = {
    type: "function" as const,
    function: {
      name: "submit_contacts",
      description: "Submit extracted contacts.",
      parameters: {
        type: "object",
        properties: {
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                linkedin: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: ["contacts"],
      },
    },
  };

  const prompt = `You are extracting individual people (employees, founders, leadership team members, board members) from a company website's team / about / contact / leadership page. The page may be in English or Norwegian.

URL: ${pageUrl}

Page text:
"""
${pageText}
"""

Rules:
- Only return real named individuals.
- Skip generic mailboxes (info@, contact@, sales@, post@, kontakt@) — those are not individuals.
- Skip a contact if the only information is a name with NO title, email, phone, or LinkedIn. (Name alone is too noisy.)
- Norwegian titles like "Daglig leder", "Styreleder", "Salgssjef" count as titles.
- Maximum 20 contacts.
- linkedin must be a full URL (https://...).
- If nothing qualifies, return an empty array.

Call submit_contacts with the result.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "submit_contacts" } },
    }),
  });
  if (!resp.ok) {
    throw new Error(`LLM error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argStr: string | undefined = call?.function?.arguments;
  if (!argStr) return [];
  const parsed = tryParseLooseJson(argStr) as { contacts?: unknown } | null;
  const arr = Array.isArray(parsed?.contacts) ? (parsed!.contacts as Record<string, unknown>[]) : [];
  return arr.slice(0, MAX_CONTACTS).map((c) => ({
    name: String(c.name ?? "").trim(),
    title: typeof c.title === "string" ? c.title.trim() || null : null,
    email: typeof c.email === "string" ? c.email.trim() || null : null,
    phone: typeof c.phone === "string" ? c.phone.trim() || null : null,
    linkedin: typeof c.linkedin === "string" ? c.linkedin.trim() || null : null,
  })).filter((c) => c.name.length > 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supaAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await supaAuth.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const actor_id = typeof body?.actor_id === "string" ? body.actor_id : null;
    const base_url = typeof body?.base_url === "string" ? body.base_url : null;
    if (!actor_id || !base_url) return json({ error: "Missing actor_id or base_url" }, 400);

    let baseUrl: URL;
    try {
      baseUrl = new URL(base_url);
      if (!["http:", "https:"].includes(baseUrl.protocol)) throw new Error("proto");
    } catch {
      return json({ error: "Invalid base_url" }, 400);
    }

    console.log(`[enrich-from-team-page] start actor_id=${actor_id} base_url=${baseUrl.href}`);

    const supa = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: actorRow, error: actorErr } = await supa
      .from("actors")
      .select("id, verifier_id")
      .eq("id", actor_id)
      .maybeSingle();
    if (actorErr || !actorRow) return json({ error: "Actor not found" }, 404);

    const { data: isAdminData } = await supa.rpc("is_admin", { _user_id: user.id });
    const isAdmin = isAdminData === true;
    if (!isAdmin && actorRow.verifier_id !== user.id) return json({ error: "Forbidden" }, 403);

    const found = await findTeamPage(baseUrl.href);
    if (!found) {
      console.log(`[enrich-from-team-page] no team page found for ${baseUrl.href}`);
      return json({
        ok: true,
        scraped_count: 0,
        written_count: 0,
        skipped_count: 0,
        source_url: null,
        reason: "no_team_page_found",
      });
    }
    console.log(`[enrich-from-team-page] candidate ${found.url} score=${found.score}`);

    let contacts: ScrapedContact[];
    try {
      contacts = await llmExtractContacts(found.text, found.url, lovableKey);
    } catch (e) {
      console.error(`[enrich-from-team-page] llm error`, e);
      return json({
        ok: false,
        error: (e as Error).message,
        source_url: found.url,
      }, 502);
    }

    const filtered = contacts.filter(
      (c) => c.name && (c.title || c.email || c.phone || c.linkedin),
    );
    console.log(`[enrich-from-team-page] llm returned ${contacts.length}, kept ${filtered.length}`);

    const { data: existing } = await supa
      .from("actor_contacts")
      .select("name")
      .eq("actor_id", actor_id);
    const seen = new Set<string>(
      (existing ?? []).map((r) => (r.name ?? "").trim().toLowerCase()),
    );

    let written = 0;
    let skipped = 0;
    for (const c of filtered) {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const { error: insErr } = await supa.from("actor_contacts").insert({
        actor_id,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
        linkedin: c.linkedin,
        source: "auto_scrape",
      });
      if (insErr) {
        console.error(`[enrich-from-team-page] insert failed`, insErr);
        skipped++;
        continue;
      }
      written++;
    }

    await supa.rpc("fn_audit_log_event", {
      p_event_type: "actor_contacts_scraped",
      p_target_table: "actor_contacts",
      p_target_record_id: actor_id,
      p_actor_id: actor_id,
      p_programme_id: null,
      p_changes: {
        source_url: found.url,
        base_url: baseUrl.href,
        scraped_count: filtered.length,
        written_count: written,
        skipped_count: skipped,
      } as never,
      p_reason: "auto-extract contacts from team page",
    } as never);

    return json({
      ok: true,
      scraped_count: filtered.length,
      written_count: written,
      skipped_count: skipped,
      source_url: found.url,
    });
  } catch (e) {
    console.error(`[enrich-from-team-page] fatal`, e);
    return json({ error: (e as Error).message }, 500);
  }
});
