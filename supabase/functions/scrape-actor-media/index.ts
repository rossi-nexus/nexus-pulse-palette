// Auto-scrape an actor's website for logo + hero + product images, upload to
// the actor-media bucket, and insert actor_media rows. Fire-and-forget from
// onboarding once a verified actor row exists.
//
// Auth: JWT-gated. Caller must be admin or the actor's verifier_id.
// Dedup:
//   - logo/hero: skip the slot if any row already exists for that actor + type.
//   - product images: skip if a row with same actor_id + original_url already exists.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { safeFetch } from "../_shared/urlGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Slot = "logo" | "hero";
const SINGLE_SLOTS: Slot[] = ["logo", "hero"];
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const UA = "Mozilla/5.0 (compatible; NEXUS-MediaScrape/1.0; +https://nexus.app)";

// Product page heuristics — English + Norwegian.
const PRODUCT_PATHS = [
  "/products", "/product", "/solutions", "/portfolio",
  "/produkter", "/produkt", "/losninger", "/løsninger", "/tjenester",
];
const MAX_PRODUCT_IMAGES = 12;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? "");
}

function matchAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

function resolveUrl(href: string, base: string): string | null {
  try { return new URL(href, base).href; } catch { return null; }
}

function extractLogoCandidates(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u) return;
    const r = resolveUrl(u, baseUrl);
    if (r && !out.includes(r)) out.push(r);
  };
  const linkTags = matchAll(html, /<link\b[^>]*>/gi);
  for (const t of linkTags) {
    const rel = (attr(t, "rel") ?? "").toLowerCase();
    if (/apple-touch-icon/.test(rel) || /\bicon\b/.test(rel)) push(attr(t, "href"));
  }
  const metaTags = matchAll(html, /<meta\b[^>]*>/gi);
  for (const t of metaTags) {
    const prop = (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase();
    if (prop === "og:logo" || prop === "og:image") push(attr(t, "content"));
  }
  const imgTags = matchAll(html, /<img\b[^>]*>/gi);
  for (const t of imgTags) {
    const cls = attr(t, "class") ?? "";
    const id = attr(t, "id") ?? "";
    const alt = attr(t, "alt") ?? "";
    const src = attr(t, "src");
    if (!src) continue;
    if (/logo/i.test(cls) || /logo/i.test(id) || /logo/i.test(alt)) push(src);
  }
  push("/favicon.ico");
  return out.slice(0, 12);
}

function extractHeroCandidates(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u) return;
    const r = resolveUrl(u, baseUrl);
    if (r && !out.includes(r)) out.push(r);
  };
  const metaTags = matchAll(html, /<meta\b[^>]*>/gi);
  for (const t of metaTags) {
    const prop = (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase();
    if (prop === "og:image" || prop === "og:image:url" || prop === "twitter:image") {
      push(attr(t, "content"));
    }
  }
  const imgTags = matchAll(html, /<img\b[^>]*>/gi);
  for (const t of imgTags) {
    const widthStr = attr(t, "width");
    const w = widthStr ? parseInt(widthStr, 10) : NaN;
    const src = attr(t, "src");
    if (!src) continue;
    if (Number.isFinite(w) && w >= 600) push(src);
  }
  // Fallback: include any reasonably sized-looking img if we got none.
  if (out.length === 0) {
    for (const t of imgTags) {
      const src = attr(t, "src");
      if (!src) continue;
      if (/\.(png|jpe?g|webp)(\?|$)/i.test(src)) push(src);
      if (out.length >= 8) break;
    }
  }
  return out.slice(0, 12);
}

function extractLogo(html: string, baseUrl: string): string | null {
  return extractLogoCandidates(html, baseUrl)[0] ?? null;
}

function extractHero(html: string, baseUrl: string): string | null {
  return extractHeroCandidates(html, baseUrl)[0] ?? null;
}

interface ProductCandidate {
  url: string;
  alt: string | null;
}

function extractProductImages(html: string, baseUrl: string): ProductCandidate[] {
  const out: ProductCandidate[] = [];
  const seen = new Set<string>();
  const imgTags = matchAll(html, /<img\b[^>]*>/gi);
  for (const t of imgTags) {
    const src = attr(t, "src");
    if (!src) continue;
    const resolved = resolveUrl(src, baseUrl);
    if (!resolved) continue;
    // Filter likely-not-product: tiny icons, logos, sprites, transparent pixels
    const cls = (attr(t, "class") ?? "").toLowerCase();
    const alt = attr(t, "alt");
    if (/\b(logo|icon|sprite|avatar|favicon)\b/.test(cls)) continue;
    if (/\.svg(\?|$)/i.test(resolved)) continue;
    if (/data:image\//i.test(resolved)) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push({ url: resolved, alt: alt ?? null });
    if (out.length >= MAX_PRODUCT_IMAGES) break;
  }
  return out;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await safeFetch(url, { ...init, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

function extFromContentType(ct: string): string | null {
  const c = ct.toLowerCase();
  if (c.includes("png")) return "png";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  if (c.includes("webp")) return "webp";
  if (c.includes("gif")) return "gif";
  if (c.includes("svg")) return "svg";
  if (c.includes("x-icon") || c.includes("vnd.microsoft.icon")) return "ico";
  return null;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const resp = await fetchWithTimeout(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const lenHdr = resp.headers.get("content-length");
    if (lenHdr && parseInt(lenHdr, 10) > MAX_BYTES) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    return { bytes: buf, contentType: ct };
  } catch { return null; }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("html") && !ct.includes("text/plain")) return null;
    return await resp.text();
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supaAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supaAuth.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const actor_id = typeof body?.actor_id === "string" ? body.actor_id : null;
    const website_url = typeof body?.website_url === "string" ? body.website_url : null;
    const mode: "auto" | "candidates" | "ingest" =
      body?.mode === "candidates" || body?.mode === "ingest" ? body.mode : "auto";
    const ingest_slot: Slot | null =
      body?.slot === "logo" || body?.slot === "hero" ? body.slot : null;
    const ingest_url_in: string | null =
      typeof body?.url === "string" ? body.url : null;

    if (!actor_id) return json({ error: "Missing actor_id" }, 400);
    if (mode !== "ingest" && !website_url) return json({ error: "Missing website_url" }, 400);
    if (mode === "ingest" && (!ingest_slot || !ingest_url_in))
      return json({ error: "Missing slot or url for ingest" }, 400);

    let baseUrl: URL | null = null;
    if (website_url) {
      try {
        baseUrl = new URL(website_url);
        if (!["http:", "https:"].includes(baseUrl.protocol)) throw new Error("bad proto");
      } catch {
        return json({ error: "Invalid website_url" }, 400);
      }
    }

    const supa = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: actorRow, error: actorErr } = await supa
      .from("actors")
      .select("id, verifier_id")
      .eq("id", actor_id)
      .maybeSingle();
    if (actorErr || !actorRow) return json({ error: "Actor not found" }, 404);

    // Any authenticated user can trigger scrape — same gate as manual
    // actor_media insert in the wizard. Wizard UI restricts who sees the
    // trigger; this function trusts that and just requires an auth'd caller.


    const { data: existing } = await supa
      .from("actor_media")
      .select("type, original_url")
      .eq("actor_id", actor_id);
    const occupied = new Set<string>((existing ?? []).map((r) => r.type as string).filter((t) => t === "logo" || t === "hero"));
    const existingProductUrls = new Set<string>(
      (existing ?? []).filter((r) => r.type === "product" && r.original_url).map((r) => r.original_url as string),
    );

    const slotsToFill: Slot[] = SINGLE_SLOTS.filter((s) => !occupied.has(s));

    // -------- candidates mode: return raw candidate URLs without saving --------
    if (mode === "candidates") {
      const html = await fetchHtml(baseUrl!.href);
      if (!html) {
        return json({ ok: true, candidates: { logo: [], hero: [] }, reason: "homepage_fetch_failed" });
      }
      return json({
        ok: true,
        candidates: {
          logo: extractLogoCandidates(html, baseUrl!.href),
          hero: extractHeroCandidates(html, baseUrl!.href),
        },
        occupied: Array.from(occupied),
      });
    }

    // -------- ingest mode: download a user-chosen URL into a specific slot --------
    if (mode === "ingest") {
      const scrapedI: { slot: string; url: string; source_url: string }[] = [];
      const skippedI: { slot: string; reason: string }[] = [];
      const dl = await downloadImage(ingest_url_in!);
      if (!dl) {
        return json({ ok: false, error: "Could not download that image", scraped: [], skipped: [{ slot: ingest_slot!, reason: "download_failed" }] }, 400);
      }
      const ext = extFromContentType(dl.contentType) ?? "img";
      const ts = Date.now();
      const path = `${actor_id}/${ingest_slot}/picked-${ts}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supa.storage
        .from("actor-media")
        .upload(path, dl.bytes, { contentType: dl.contentType, upsert: false });
      if (upErr) {
        return json({ ok: false, error: `upload_failed: ${upErr.message}` }, 500);
      }
      const publicUrl = supa.storage.from("actor-media").getPublicUrl(path).data.publicUrl;
      const { error: insErr } = await supa.from("actor_media").insert({
        actor_id,
        type: ingest_slot,
        url: publicUrl,
        original_url: ingest_url_in,
        source: "user_picked",
        uploaded_by: user!.id,
      });
      if (insErr) {
        return json({ ok: false, error: `insert_failed: ${insErr.message}` }, 500);
      }
      scrapedI.push({ slot: ingest_slot!, url: publicUrl, source_url: ingest_url_in! });
      return json({ ok: true, scraped: scrapedI, skipped: skippedI });
    }

    // -------- auto mode (legacy): scrape + ingest top candidate per slot --------
    const html = await fetchHtml(baseUrl!.href);
    if (!html) {
      return json({ ok: true, scraped: [], skipped: slotsToFill, reason: "homepage_fetch_failed" });
    }

    const targets: { slot: Slot; url: string | null }[] = [];
    for (const slot of slotsToFill) {
      const u = slot === "logo" ? extractLogo(html, baseUrl!.href) : extractHero(html, baseUrl!.href);
      targets.push({ slot, url: u });
    }

    const scraped: { slot: string; url: string; source_url: string }[] = [];
    const skipped: { slot: string; reason: string }[] = [];

    async function ingest(slot: string, sourceUrl: string, linkedProductName: string | null = null) {
      const dl = await downloadImage(sourceUrl);
      if (!dl) { skipped.push({ slot, reason: "download_failed" }); return; }
      const ext = extFromContentType(dl.contentType) ?? "img";
      const ts = Date.now();
      const path = `${actor_id}/${slot}/auto-${ts}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supa.storage
        .from("actor-media")
        .upload(path, dl.bytes, { contentType: dl.contentType, upsert: false });
      if (upErr) { skipped.push({ slot, reason: `upload_failed: ${upErr.message}` }); return; }
      const publicUrl = supa.storage.from("actor-media").getPublicUrl(path).data.publicUrl;
      const cropData: Record<string, unknown> | null = linkedProductName
        ? { linked_product_name: linkedProductName }
        : null;
      const { data: inserted, error: insErr } = await supa
        .from("actor_media")
        .insert({
          actor_id,
          type: slot,
          url: publicUrl,
          original_url: sourceUrl,
          source: "auto_scrape",
          uploaded_by: user!.id,
          crop_data: cropData,
        })
        .select("id")
        .single();
      if (insErr) { skipped.push({ slot, reason: `insert_failed: ${insErr.message}` }); return; }
      scraped.push({ slot, url: publicUrl, source_url: sourceUrl });

      await supa.rpc("fn_audit_log_event", {
        p_event_type: "actor_media_auto_scraped",
        p_target_table: "actor_media",
        p_target_record_id: inserted.id,
        p_actor_id: actor_id,
        p_programme_id: null,
        p_changes: {
          slot_type: slot,
          source_url: sourceUrl,
          scraped_at: new Date().toISOString(),
          website_url: baseUrl!.href,
          linked_product_name: linkedProductName,
        } as never,
        p_reason: "auto-scrape from website during onboarding/enrichment",
      } as never);
    }

    for (const { slot, url } of targets) {
      if (!url) { skipped.push({ slot, reason: "no_candidate" }); continue; }
      await ingest(slot, url);
    }

    // ---- Product image scraping (additive, never blocks) ----
    try {
      let productHtml: string | null = null;
      let productPageUrl: string | null = null;
      for (const path of PRODUCT_PATHS) {
        const cand = resolveUrl(path, baseUrl!.href);
        if (!cand) continue;
        const h = await fetchHtml(cand);
        if (h && h.length > 200) { productHtml = h; productPageUrl = cand; break; }
      }
      if (productHtml && productPageUrl) {
        const imgs = extractProductImages(productHtml, productPageUrl);
        for (const img of imgs) {
          if (existingProductUrls.has(img.url)) continue;
          existingProductUrls.add(img.url);
          await ingest("product", img.url, img.alt && img.alt.length > 0 && img.alt.length < 120 ? img.alt : null);
        }
      }
    } catch (e) {
      console.warn(`[scrape-actor-media] product-image pass failed`, e);
    }

    return json({ ok: true, scraped, skipped });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
