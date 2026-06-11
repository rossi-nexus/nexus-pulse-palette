// V3 Batch B.2 — Address Discovery: fetch a company website and try to
// extract one or more postal addresses from common locations:
//   1. schema.org PostalAddress JSON-LD (highest fidelity)
//   2. /kontakt or /contact page (Norwegian + English defaults)
//   3. <footer> text on the homepage
//
// Each candidate carries a `matched_path` diagnostic so the build report can
// describe where the address came from.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { safeFetch } from "../_shared/urlGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AddressCandidate {
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  raw_text: string;
  matched_path: "schema_jsonld" | "kontakt" | "contact" | "footer";
  source_url: string;
}

const UA =
  "Mozilla/5.0 (compatible; NEXUS-AddressDiscovery/1.0; +https://nexus.app)";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // tolerate malformed JSON-LD blocks
    }
  }
  return out;
}

function findPostalAddress(node: any): any | null {
  if (!node || typeof node !== "object") return null;
  const type = node["@type"];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.includes("PostalAddress")) return node;
  if (node.address) {
    const found = findPostalAddress(node.address);
    if (found) return found;
  }
  if (Array.isArray(node["@graph"])) {
    for (const child of node["@graph"]) {
      const found = findPostalAddress(child);
      if (found) return found;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "address" || key === "@graph") continue;
    const v = node[key];
    if (v && typeof v === "object") {
      const found = findPostalAddress(v);
      if (found) return found;
    }
  }
  return null;
}

function fromSchema(addr: any, sourceUrl: string): AddressCandidate | null {
  if (!addr) return null;
  const street = (addr.streetAddress ?? "").toString().trim() || null;
  const city = (addr.addressLocality ?? "").toString().trim() || null;
  const region = (addr.addressRegion ?? "").toString().trim() || null;
  const postal = (addr.postalCode ?? "").toString().trim() || null;
  const country = (
    typeof addr.addressCountry === "object"
      ? (addr.addressCountry?.name ?? addr.addressCountry?.["@id"] ?? "")
      : (addr.addressCountry ?? "")
  )
    .toString()
    .trim() || null;
  if (!street && !city) return null;
  return {
    street_address: street,
    postal_code: postal,
    city,
    region,
    country,
    raw_text: [street, postal, city, country].filter(Boolean).join(", "),
    matched_path: "schema_jsonld",
    source_url: sourceUrl,
  };
}

// Norway-biased regex (works for most European postal formats too).
// Matches: "Street 12, 1234 City" or "Street 12\n1234 City"
const ADDRESS_RE =
  /([A-ZÆØÅa-zæøå0-9.,'\- ]{4,80}\s\d{1,4}[A-Za-z]?)\s*[,\n]?\s*(\d{4,5})\s+([A-ZÆØÅ][A-ZÆØÅa-zæøå\-' ]{1,40})/g;

function extractFromText(
  text: string,
  matchedPath: AddressCandidate["matched_path"],
  sourceUrl: string,
  limit = 3,
): AddressCandidate[] {
  const out: AddressCandidate[] = [];
  let m: RegExpExecArray | null;
  ADDRESS_RE.lastIndex = 0;
  while ((m = ADDRESS_RE.exec(text)) !== null && out.length < limit) {
    out.push({
      street_address: m[1].trim().replace(/\s+/g, " "),
      postal_code: m[2],
      city: m[3].trim(),
      region: null,
      country: null,
      raw_text: m[0].trim(),
      matched_path: matchedPath,
      source_url: sourceUrl,
    });
  }
  return out;
}

function extractFooter(html: string): string {
  const m = html.match(/<footer[\s\S]*?<\/footer>/i);
  if (!m) return "";
  return stripTags(m[0]);
}

function dedupe(list: AddressCandidate[]): AddressCandidate[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.street_address ?? ""}|${c.postal_code ?? ""}|${c.city ?? ""}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const websiteRaw = body?.website;
    if (typeof websiteRaw !== "string" || websiteRaw.length < 4) {
      return new Response(JSON.stringify({ error: "website is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let baseUrl: URL;
    try {
      baseUrl = new URL(websiteRaw.startsWith("http") ? websiteRaw : `https://${websiteRaw}`);
    } catch {
      return new Response(JSON.stringify({ error: "invalid website URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidates: AddressCandidate[] = [];
    const diagnostics: { path: string; status: "fetched" | "skipped" | "failed"; hits: number }[] = [];

    // 1) Homepage — schema.org + footer
    const homeHtml = await fetchText(baseUrl.origin);
    if (homeHtml) {
      const blocks = extractJsonLd(homeHtml);
      let schemaHits = 0;
      for (const b of blocks) {
        const addr = findPostalAddress(b);
        const cand = fromSchema(addr, baseUrl.origin);
        if (cand) {
          candidates.push(cand);
          schemaHits++;
        }
      }
      diagnostics.push({ path: "schema_jsonld@/", status: "fetched", hits: schemaHits });

      const footerText = extractFooter(homeHtml);
      const footerHits = extractFromText(footerText, "footer", baseUrl.origin, 2);
      candidates.push(...footerHits);
      diagnostics.push({ path: "footer@/", status: "fetched", hits: footerHits.length });
    } else {
      diagnostics.push({ path: "/", status: "failed", hits: 0 });
    }

    // 2) /kontakt and /contact
    for (const path of ["/kontakt", "/contact", "/kontakt-oss", "/contact-us"]) {
      const url = new URL(path, baseUrl.origin).toString();
      const html = await fetchText(url);
      if (!html) {
        diagnostics.push({ path, status: "failed", hits: 0 });
        continue;
      }
      const text = stripTags(html);
      const matchedPath: AddressCandidate["matched_path"] = path.includes("kontakt")
        ? "kontakt"
        : "contact";
      // Schema first
      const blocks = extractJsonLd(html);
      let hits = 0;
      for (const b of blocks) {
        const addr = findPostalAddress(b);
        const cand = fromSchema(addr, url);
        if (cand) {
          candidates.push(cand);
          hits++;
        }
      }
      const textHits = extractFromText(text, matchedPath, url, 3);
      candidates.push(...textHits);
      hits += textHits.length;
      diagnostics.push({ path, status: "fetched", hits });
    }

    const unique = dedupe(candidates);
    return new Response(
      JSON.stringify({
        found: unique.length > 0,
        candidates: unique,
        diagnostics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Discovery failed: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
