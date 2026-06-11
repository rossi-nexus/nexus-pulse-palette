/**
 * extract-url-text — INTERNAL-ONLY edge function.
 *
 * Auth model: shared-secret header (`X-Internal-Secret` matched against
 * `INTERNAL_FUNCTION_SECRET`). Deliberately NOT JWT-gated.
 *
 * Why: this function is called server-to-server from `interpret-need` only.
 * No user-facing client should ever hit it directly. Routing user JWTs
 * through a second edge function for an internal extraction step adds
 * latency without security benefit.
 *
 * Exception to Rule #23 (all edge functions JWT-gated). Documented here so
 * audits don't flag it as a missing gate.
 *
 * Last reviewed: 2026-05-21 (Access architecture audit, A4 close).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { safeFetch } from "../_shared/urlGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalSecret = req.headers.get("X-Internal-Secret");
    const expected = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!expected) {
      return new Response(
        JSON.stringify({ error: "INTERNAL_FUNCTION_SECRET not configured on the server. Set it in edge function secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (internalSecret !== expected) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "No URL provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format. Please provide a valid http or https URL." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the page — use a real browser UA. Many sites (esp. behind
    // Cloudflare / corporate WAFs) return 403/429 to obvious bot UAs.
    // Retry once with backoff on 429/503.
    const fetchHeaders: HeadersInit = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    let response = await safeFetch(url, { headers: fetchHeaders });
    if (response.status === 429 || response.status === 503) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 1500));
      response = await safeFetch(url, { headers: fetchHeaders });
    }

    if (!response.ok) {
      const friendly =
        response.status === 429
          ? "The website is rate-limiting automated requests (HTTP 429). Try again in a minute, or pick a different page on the same site."
          : response.status === 403
          ? "The website blocked the request (HTTP 403). It may require login or block automated access."
          : `Failed to fetch URL: HTTP ${response.status}`;
      return new Response(
        JSON.stringify({ error: friendly }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    let text: string;

    if (contentType.includes("text/plain")) {
      text = body;
    } else {
      // Strip HTML to get readable text
      text = stripHtml(body);
    }

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: "No readable text content found at the provided URL." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate very long content (max ~50k chars)
    const maxLen = 50000;
    const truncated = text.length > maxLen;
    const finalText = truncated ? text.slice(0, maxLen) + "\n\n[Content truncated]" : text;

    return new Response(
      JSON.stringify({ text: finalText.trim(), url, truncated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("URL extraction error:", err);
    return new Response(
      JSON.stringify({ error: `Failed to extract content: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function stripHtml(html: string): string {
  // Remove script and style blocks
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  // Convert block elements to newlines
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n");

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");

  // Clean up whitespace
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return text;
}
