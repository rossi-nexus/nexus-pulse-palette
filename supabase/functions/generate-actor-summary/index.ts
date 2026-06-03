// Generates a short actor summary description from their website.
// Fetches the homepage HTML, strips it down, and asks Lovable AI for a
// concise 2-4 sentence paragraph describing what the actor does.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_CHARS = 8000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const actorId: string | undefined = body?.actor_id;
    let websiteUrl: string | undefined = body?.website_url;
    const actorName: string | undefined = body?.actor_name;

    if (!websiteUrl && actorId) {
      const { data: actorRow } = await supabase
        .from("actors")
        .select("websites, name")
        .eq("id", actorId)
        .maybeSingle();
      websiteUrl = actorRow?.websites?.[0] ?? undefined;
    }
    if (!websiteUrl) {
      return new Response(
        JSON.stringify({ error: "No website on file for this actor." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let pageText = "";
    try {
      const resp = await fetch(websiteUrl, {
        headers: { "User-Agent": "Mozilla/5.0 NEXUS bot" },
      });
      const html = await resp.text();
      pageText = stripHtml(html).slice(0, MAX_CHARS);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `Could not fetch website: ${e}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const prompt = `You are summarising what an organisation does for a defence/security/preparedness discovery database.

Actor: ${actorName ?? "(unknown)"}
Website: ${websiteUrl}

Write a single concise paragraph of 2-4 sentences in neutral, factual English describing what this organisation does. Focus on: sector, core offering, who they serve. Do NOT include marketing fluff, taglines, awards, or speculation. If the page text is too thin to write a confident summary, say so in one short sentence starting with "Insufficient information".

Page text:
"""
${pageText}
"""`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      return new Response(
        JSON.stringify({ error: `AI error: ${aiResp.status} ${errText}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const aiJson = await aiResp.json();
    const summary: string =
      aiJson?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ summary, source_url: websiteUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
