// V3 batch #4 — Per-product enrichment.
// Discovers a product's dedicated page on the actor's website, scrapes images +
// description + specs + datasheet links, and upserts into actor_descriptions /
// actor_media. Tag suggestions are returned to the caller (NOT auto-inserted —
// the consultant approval queue stays in charge of ontology tags).
//
// Auth: JWT-gated. Caller must be admin or the actor's verifier.
// Idempotent: re-running on the same product updates the description in place
// and skips images whose URL is already persisted.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (compatible; NEXUS-ProductScrape/1.0; +https://nexus.app)";
const FETCH_TIMEOUT_MS = 6_000;
const MAX_CANDIDATES = 16;
const MAX_TEXT_CHARS = 18_000;
const MAX_IMAGES = 8;

// Product-index paths to probe (English + Norwegian).
const PRODUCT_INDEX_PATHS = [
  "/products",
  "/produkter",
  "/solutions",
  "/losninger",
  "/løsninger",
  "/services",
  "/tjenester",
  "/portfolio",
  "/portefolje",
  "/portefølje",
  "/brands",
  "/varemerker",
  "/range",
  "/sortiment",
  "/our-products",
  "/vare-produkter",
  "/våre-produkter",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
  return t.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join("\n");
}

interface AnchorMatch { href: string; text: string }

function extractAnchors(html: string): AnchorMatch[] {
  const out: AnchorMatch[] = [];
  const re = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = (m[2] ?? m[3] ?? "").trim();
    const text = m[4].replace(/<[^>]+>/g, "").trim();
    if (href) out.push({ href, text });
  }
  return out;
}

function scoreCandidate(href: string, text: string, productName: string, baseUrl: string): number {
  const slug = normalize(productName);
  const tokens = slug.split("-").filter((t) => t.length >= 3);
  let url = "";
  try { url = new URL(href, baseUrl).href.toLowerCase(); } catch { return 0; }
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  const t = text.toLowerCase();
  let score = 0;
  // Direct path slug match (strongest).
  if (path.includes(`/${slug}`) || path.endsWith(`/${slug}/`) || path.endsWith(`/${slug}`)) score += 50;
  // Path contains all tokens.
  if (tokens.length > 0 && tokens.every((tok) => path.includes(tok))) score += 20;
  // Text exact-ish match.
  if (t === productName.toLowerCase() || t.includes(productName.toLowerCase())) score += 15;
  // Text contains most tokens.
  if (tokens.length > 0) {
    const matched = tokens.filter((tok) => t.includes(tok)).length;
    if (matched === tokens.length) score += 10;
    else if (matched >= Math.ceil(tokens.length / 2)) score += 5;
  }
  // Path contains some tokens.
  if (tokens.length > 0) {
    const matched = tokens.filter((tok) => path.includes(tok)).length;
    score += matched * 3;
  }
  // Strong indicator that this is a product-style URL.
  if (/\/(produkt(er)?|product(s)?|solution(s)?|losning(er)?|løsning(er)?|item|datasheet|datablad)\//.test(path)) score += 5;
  // Penalize generic pages.
  if (/\/(contact|kontakt|about|om|cart|checkout|news|nyheter|blog|career)/.test(path)) score -= 5;
  return score;
}

async function discoverProductUrl(
  baseUrl: string,
  productName: string,
  diag: Record<string, unknown>,
): Promise<string | null> {
  // Build seed URLs: homepage + hardcoded product-index paths.
  const seeds = new Set<string>();
  try { seeds.add(new URL("/", baseUrl).href); } catch { /* skip */ }
  for (const p of PRODUCT_INDEX_PATHS) {
    try { seeds.add(new URL(p, baseUrl).href); } catch { /* skip */ }
  }
  const probed = Array.from(seeds).slice(0, MAX_CANDIDATES);
  diag.attempted_index_paths = probed;
  // Probe in parallel.
  const pages = await Promise.all(probed.map(async (u) => {
    try {
      const r = await fetchWithTimeout(u);
      if (!r.ok) return null;
      const ct = (r.headers.get("content-type") ?? "").toLowerCase();
      if (!ct.includes("html")) return null;
      return { url: u, html: await r.text() };
    } catch { return null; }
  }));
  // Collect candidates from all pages.
  const scored: Array<{ url: string; score: number; source: string }> = [];
  for (const p of pages) {
    if (!p) continue;
    const anchors = extractAnchors(p.html);
    for (const a of anchors) {
      const score = scoreCandidate(a.href, a.text, productName, p.url);
      if (score <= 0) continue;
      try {
        const full = new URL(a.href, p.url).href;
        // Same-host only.
        if (new URL(full).host !== new URL(baseUrl).host) continue;
        scored.push({ url: full, score, source: p.url });
      } catch { /* skip */ }
    }
  }
  // Dedup by URL — keep highest score.
  const best = new Map<string, { url: string; score: number; source: string }>();
  for (const s of scored) {
    const prev = best.get(s.url);
    if (!prev || s.score > prev.score) best.set(s.url, s);
  }
  const ranked = Array.from(best.values()).sort((a, b) => b.score - a.score);
  diag.candidates_top = ranked.slice(0, 5);
  if (ranked.length === 0 || ranked[0].score < 10) return null;
  return ranked[0].url;
}

interface ImageHit { url: string; alt: string; width?: number; height?: number }

// Deny-list: filenames that are almost never genuine product imagery.
// Defensive widening (audit batch 2026-06-03) — adds flag/partner/badge/award.
const IMAGE_DENY_RE =
  /(favicon|logo|sprite|tracker|pixel|icon[-_/]|flag[-_]|country[-_]flag|partner|badge|award|placeholder|spacer|banner[-_]ad)/i;

function extractImages(html: string, pageUrl: string): ImageHit[] {
  const seen = new Set<string>();
  const out: ImageHit[] = [];
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    const wAttr = parseInt(/\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? "0", 10);
    const hAttr = parseInt(/\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? "0", 10);
    if (!src) continue;
    let full = "";
    try { full = new URL(src, pageUrl).href; } catch { continue; }
    if (seen.has(full)) continue;
    if (IMAGE_DENY_RE.test(full)) continue;
    if (full.startsWith("data:")) continue;
    // Drop tiny declared sizes (flags/icons routinely render at <120px).
    if ((wAttr > 0 && wAttr < 120) || (hAttr > 0 && hAttr < 120)) continue;
    // Drop SVG country flags by filename hint.
    if (/\.svg(\?|$)/i.test(full) && /(flag|country|\bnor\b|\bswe\b|\bfin\b|\bdnk\b|\busa\b|\bgbr\b)/i.test(full)) continue;
    seen.add(full);
    out.push({ url: full, alt, width: wAttr || undefined, height: hAttr || undefined });
    if (out.length >= MAX_IMAGES * 2) break;
  }
  const og = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]
    ?? /<meta\b[^>]*name\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]
    ?? "";
  if (og) {
    try {
      const full = new URL(og, pageUrl).href;
      if (!seen.has(full) && !IMAGE_DENY_RE.test(full)) {
        seen.add(full);
        out.unshift({ url: full, alt: "og:image" });
      }
    } catch { /* skip */ }
  }
  return out.slice(0, MAX_IMAGES);
}

/**
 * Defensive association scorer (audit batch — 2026-06-03).
 * Returns linked=true only if there is an EXPLICIT signal tying this image
 * to the product being processed. Images that fail are still persisted but
 * stored as orphan (linked_product_name=null) so a human reviewer — not the
 * scraper — decides where they belong.
 *
 * This is the inline fix called out in the audit prompt (1d): the previous
 * behaviour force-linked every surviving image to whichever product the
 * function happened to be processing, causing flag SVGs and partner-brand
 * assets to be assigned to "C4ISR System" on Equipnor.
 */
function hasStrongProductAssociation(
  img: ImageHit,
  productName: string,
): { linked: boolean; reason: string } {
  const slug = normalize(productName);
  const tokens = slug.split("-").filter((t) => t.length >= 3);
  const alt = (img.alt ?? "").toLowerCase();
  const file = img.url.toLowerCase();
  if (alt === "og:image" && (file.includes(slug) || tokens.some((t) => file.includes(t)))) {
    return { linked: true, reason: "og:image with token match" };
  }
  if (slug.length >= 4 && file.includes(slug)) {
    return { linked: true, reason: "filename contains product slug" };
  }
  if (alt.length > 0 && (alt.includes(productName.toLowerCase()) || (tokens.length > 0 && tokens.every((t) => alt.includes(t))))) {
    return { linked: true, reason: "alt text matches product name" };
  }
  if (tokens.length >= 2) {
    const hits = tokens.filter((t) => file.includes(t)).length;
    if (hits >= Math.ceil(tokens.length * 0.75)) {
      return { linked: true, reason: "filename token majority match" };
    }
  }
  return { linked: false, reason: "no explicit product-association signal" };
}

function extractDatasheetLinks(html: string, pageUrl: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const full = new URL(m[1], pageUrl).href;
      if (seen.has(full)) continue;
      seen.add(full);
      out.push(full);
    } catch { /* skip */ }
  }
  return out.slice(0, 6);
}

interface LlmExtract {
  description: string;
  specs: Array<{ key: string; value: string }>;
  suggested_tags: Array<{ headline: string; entry_name: string; confidence: "high" | "medium" | "low" }>;
}

async function llmExtract(
  pageText: string,
  productName: string,
  actorName: string,
  pageUrl: string,
  lovableApiKey: string,
): Promise<LlmExtract> {
  const TOOL = {
    type: "function" as const,
    function: {
      name: "submit_product_enrichment",
      description: "Submit extracted product enrichment.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "1-3 paragraphs of clear professional English describing the product. Empty string if nothing meaningful can be extracted." },
          specs: {
            type: "array",
            items: {
              type: "object",
              properties: { key: { type: "string" }, value: { type: "string" } },
              required: ["key", "value"],
            },
          },
          suggested_tags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                headline: { type: "string", description: "Short noun phrase summarising the tag." },
                entry_name: { type: "string", description: "Canonical name (e.g. 'Counter-UAS', 'Maritime Surveillance')." },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["entry_name", "confidence"],
            },
          },
        },
        required: ["description", "specs", "suggested_tags"],
      },
    },
  };
  const prompt = `You are extracting structured product information from a manufacturer's product page.

LANGUAGE: All output MUST be in clear professional English. Translate any Norwegian / Swedish / Danish / Finnish source content. Proper nouns (product brand names, company name) stay as-is.

Company: ${actorName}
Product: ${productName}
Source URL: ${pageUrl}

Page text (truncated):
---
${pageText}
---

Extract:
1. description — a 1-3 paragraph professional English description of this specific product. Focus on what it is, what it does, who it's for, key differentiators. If the page is about the company in general (not this product), return an empty string.
2. specs — flat list of { key, value } pairs for any specifications, performance numbers, dimensions, certifications, supported standards. Skip marketing claims. 0-15 items.
3. suggested_tags — categorical tags (use cases, sectors, capabilities) you can confidently identify, with confidence high/medium/low. These will be reviewed by a consultant before being applied. 0-8 items.

Submit only via the submit_product_enrichment tool.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "submit_product_enrichment" } },
      max_tokens: 2048,
    }),
  });
  if (!resp.ok) throw new Error(`AI gateway ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const result = await resp.json();
  const args = result.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no tool call");
  const parsed = JSON.parse(args);
  return {
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    specs: Array.isArray(parsed.specs)
      ? parsed.specs
          .filter((s: any) => s && typeof s.key === "string" && typeof s.value === "string")
          .map((s: any) => ({ key: s.key.trim(), value: s.value.trim() }))
      : [],
    suggested_tags: Array.isArray(parsed.suggested_tags)
      ? parsed.suggested_tags
          .filter((t: any) => t && typeof t.entry_name === "string")
          .map((t: any) => ({
            headline: typeof t.headline === "string" ? t.headline : t.entry_name,
            entry_name: t.entry_name,
            confidence: ["high", "medium", "low"].includes(t.confidence) ? t.confidence : "medium",
          }))
      : [],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null) as
      | { actor_id?: string; product_name?: string; override_url?: string }
      | null;
    if (!body?.actor_id || !body?.product_name) {
      return json({ error: "actor_id and product_name are required" }, 400);
    }
    const actorId = body.actor_id;
    const productName = body.product_name.trim();
    const overrideUrl = body.override_url?.trim() || null;

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorization: admin OR actor's verifier.
    const { data: userRow } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
    const { data: actorRow, error: actorErr } = await admin
      .from("actors")
      .select("id, legal_name, websites, verifier_id")
      .eq("id", actorId)
      .maybeSingle();
    if (actorErr || !actorRow) return json({ error: "Actor not found" }, 404);
    const isAdmin = userRow?.role === "admin";
    const isVerifier = actorRow.verifier_id === user.id;
    if (!isAdmin && !isVerifier) return json({ error: "Forbidden" }, 403);

    const baseUrl = (actorRow.websites && actorRow.websites[0]) || null;
    if (!overrideUrl && !baseUrl) {
      return json({
        found: false,
        product_url: null,
        attempted_paths: [],
        images_added: 0,
        description_updated: false,
        specs_count: 0,
        datasheets_added: 0,
        suggested_tags: [],
        raw_diagnostics: { reason: "Actor has no website on file." },
      });
    }

    const diag: Record<string, unknown> = {};
    let productUrl = overrideUrl;
    if (!productUrl) {
      console.log(`[enrich-product-page] discovering "${productName}" on ${baseUrl}`);
      productUrl = await discoverProductUrl(baseUrl!, productName, diag);
    } else {
      diag.override_used = true;
    }

    if (!productUrl) {
      // V3 Batch C §4 — surface external brand domains the editor can try
      // when discovery on the actor's own site fails (Equipnor case).
      const referencedBrandUrls = baseUrl
        ? await collectReferencedBrandUrls(baseUrl, productName, admin, actorId)
        : [];
      return json({
        found: false,
        product_url: null,
        attempted_paths: (diag.attempted_index_paths as string[]) ?? [],
        images_added: 0,
        description_updated: false,
        specs_count: 0,
        datasheets_added: 0,
        suggested_tags: [],
        referenced_brand_urls: referencedBrandUrls,
        raw_diagnostics: diag,
      });
    }

    // Fetch product page.
    let pageHtml = "";
    try {
      const r = await fetchWithTimeout(productUrl);
      if (!r.ok) throw new Error(`status ${r.status}`);
      pageHtml = await r.text();
    } catch (e) {
      return json({
        found: false,
        product_url: productUrl,
        attempted_paths: (diag.attempted_index_paths as string[]) ?? [],
        images_added: 0,
        description_updated: false,
        specs_count: 0,
        datasheets_added: 0,
        suggested_tags: [],
        raw_diagnostics: { ...diag, fetch_error: (e as Error).message },
      });
    }

    const pageText = stripHtml(pageHtml).slice(0, MAX_TEXT_CHARS);
    const images = extractImages(pageHtml, productUrl);
    const datasheets = extractDatasheetLinks(pageHtml, productUrl);
    diag.image_candidates = images.length;
    diag.datasheet_candidates = datasheets.length;

    // LLM extract.
    let extracted: LlmExtract = { description: "", specs: [], suggested_tags: [] };
    try {
      extracted = await llmExtract(pageText, productName, actorRow.legal_name, productUrl, lovableApiKey);
      diag.llm_description_preview = extracted.description.slice(0, 200);
    } catch (e) {
      diag.llm_error = (e as Error).message;
    }

    // Persist images. Dedup against existing actor_media rows by URL.
    let imagesAdded = 0;
    if (images.length > 0) {
      const { data: existing } = await admin
        .from("actor_media")
        .select("url")
        .eq("actor_id", actorId)
        .eq("type", "product");
      const existingUrls = new Set((existing ?? []).map((r: any) => r.url));
      // Audit-batch defensive linking: only set linked_product_name when an
      // explicit association signal exists. Otherwise persist as orphan and
      // leave reassignment to a human reviewer.
      let linkedCount = 0;
      let orphanCount = 0;
      const toInsert = images
        .filter((img) => !existingUrls.has(img.url))
        .map((img) => {
          const assoc = hasStrongProductAssociation(img, productName);
          if (assoc.linked) linkedCount++; else orphanCount++;
          return {
            actor_id: actorId,
            type: "product",
            url: img.url,
            original_url: img.url,
            source: "auto_enrichment",
            uploaded_by: user.id,
            crop_data: {
              linked_product_name: assoc.linked ? productName : null,
              candidate_product_name: assoc.linked ? null : productName,
              link_reason: assoc.reason,
              alt: img.alt,
              source_page: productUrl,
            },
          };
        });
      diag.images_linked = linkedCount;
      diag.images_orphaned = orphanCount;
      if (toInsert.length > 0) {
        const { error: insertErr } = await admin.from("actor_media").insert(toInsert as any);
        if (!insertErr) imagesAdded = toInsert.length;
        else diag.image_insert_error = insertErr.message;
      }
    }

    // Persist datasheets as type='datasheet' actor_media rows.
    let datasheetsAdded = 0;
    if (datasheets.length > 0) {
      const { data: existing } = await admin
        .from("actor_media")
        .select("url")
        .eq("actor_id", actorId)
        .eq("type", "datasheet");
      const existingUrls = new Set((existing ?? []).map((r: any) => r.url));
      const toInsert = datasheets
        .filter((u) => !existingUrls.has(u))
        .map((u) => ({
          actor_id: actorId,
          type: "datasheet",
          url: u,
          original_url: u,
          source: "auto_enrichment",
          uploaded_by: user.id,
          crop_data: { linked_product_name: productName, source_page: productUrl },
        }));
      if (toInsert.length > 0) {
        const { error: insertErr } = await admin.from("actor_media").insert(toInsert as any);
        if (!insertErr) datasheetsAdded = toInsert.length;
        else diag.datasheet_insert_error = insertErr.message;
      }
    }

    // Upsert description (type='product', name=productName).
    let descriptionUpdated = false;
    if (extracted.description.length > 0) {
      const metadata = {
        specs: extracted.specs,
        datasheets,
        suggested_tags: extracted.suggested_tags,
        product_url: productUrl,
      };
      // Look up existing row.
      const { data: existing } = await admin
        .from("actor_descriptions")
        .select("id")
        .eq("actor_id", actorId)
        .eq("type", "product")
        .ilike("name", productName)
        .maybeSingle();
      if (existing?.id) {
        const { error: upErr } = await admin
          .from("actor_descriptions")
          .update({
            content: extracted.description,
            source: "auto_enrichment",
            source_url: productUrl,
            metadata,
            last_enriched_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (!upErr) descriptionUpdated = true;
        else diag.description_update_error = upErr.message;
      } else {
        const { error: insErr } = await admin
          .from("actor_descriptions")
          .insert({
            actor_id: actorId,
            type: "product",
            name: productName,
            content: extracted.description,
            source: "auto_enrichment",
            source_url: productUrl,
            metadata,
            last_enriched_at: new Date().toISOString(),
          } as any);
        if (!insErr) descriptionUpdated = true;
        else diag.description_insert_error = insErr.message;
      }
    }

    return json({
      found: true,
      product_url: productUrl,
      attempted_paths: (diag.attempted_index_paths as string[]) ?? [],
      images_added: imagesAdded,
      description_updated: descriptionUpdated,
      specs_count: extracted.specs.length,
      datasheets_added: datasheetsAdded,
      suggested_tags: extracted.suggested_tags,
      raw_diagnostics: diag,
    });
  } catch (err) {
    console.error("[enrich-product-page] fatal:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
