// Find an actor's official website via Serper. Returns top candidate plus a
// short list of alternatives so the editor can confirm. Used by the
// Complete-this-card wizard when no website is on file.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "wikipedia.org",
  "crunchbase.com",
  "bloomberg.com",
  "indeed.com",
  "glassdoor.com",
  "brreg.no",
  "proff.no",
  "1881.no",
  "purehelp.no",
]);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    if (!req.headers.get("Authorization")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const serper = Deno.env.get("SERPER_API_KEY");
    if (!serper) {
      return new Response(
        JSON.stringify({ error: "SERPER_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const body = await req.json().catch(() => null);
    const name = (body?.actor_name ?? "").toString().trim();
    const country = (body?.country ?? "").toString().trim();
    if (!name) {
      return new Response(
        JSON.stringify({ error: "actor_name is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const q = `${name} official website${country ? ` ${country}` : ""}`;
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serper, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 10 }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return new Response(
        JSON.stringify({ error: `Serper error: ${res.status} ${txt}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const json = await res.json();
    const organic: Array<{ link?: string; title?: string }> = json.organic ?? [];
    const seen = new Set<string>();
    const candidates: { url: string; host: string; title: string }[] = [];
    for (const item of organic) {
      const link = item.link;
      if (!link) continue;
      const host = hostOf(link);
      if (!host || SOCIAL_HOSTS.has(host)) continue;
      // Collapse to root origin
      let origin = link;
      try {
        origin = new URL(link).origin;
      } catch {
        continue;
      }
      if (seen.has(host)) continue;
      seen.add(host);
      candidates.push({ url: origin, host, title: item.title ?? host });
      if (candidates.length >= 5) break;
    }
    return new Response(
      JSON.stringify({
        website: candidates[0]?.url ?? null,
        candidates,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
