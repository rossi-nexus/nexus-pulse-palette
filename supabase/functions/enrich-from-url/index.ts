import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SOURCE_CHARS = 8000;

type SectionKey =
  | "capabilities"
  | "competences"
  | "domains"
  | "products"
  | "services";

interface SectionConfig {
  description: string;
  noun: string;
  guidance: string;
}

const SECTION_CONFIG: Record<SectionKey, SectionConfig> = {
  capabilities: {
    description: "technology and capability areas",
    noun: "capability areas",
    guidance:
      "Focus on broad technology domains and capability areas (e.g., Maritime, Communications, Cybersecurity, C4ISR). Not specific products.",
  },
  competences: {
    description: "expertise and know-how areas",
    noun: "competence areas",
    guidance:
      "Focus on demonstrated expertise, skills, and engineering methodologies (e.g., Systems integration, RF engineering, Penetration testing). What they know how to do, not what they sell.",
  },
  domains: {
    description: "operational environments",
    noun: "operational domains",
    guidance:
      "Focus on where and in what context the company operates (e.g., Arctic Operations, Maritime, Critical Infrastructure, Cyber). Not what they do.",
  },
  products: {
    description: "specific product categories",
    noun: "product categories",
    guidance:
      "Focus on concrete product types (e.g., Radar, Sonar, C2 software, USV, Radio). Not capabilities or services.",
  },
  services: {
    description: "specific service categories",
    noun: "service categories",
    guidance:
      "Focus on concrete services (e.g., Systems integration, Training, Maintenance, Consulting). Not products.",
  },
};

const PROPOSALS_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_proposals",
    description: "Submit extracted proposals for the requested section.",
    parameters: {
      type: "object",
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entry_name: { type: "string" },
              evidence: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["entry_name", "evidence", "confidence"],
          },
        },
        extraction_summary: { type: "string" },
      },
      required: ["proposals", "extraction_summary"],
    },
  },
};

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

async function fetchUrlText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NEXUS/1.0; +https://nexus.app)",
      Accept: "text/html,application/xhtml+xml,text/plain,*/*",
    },
    redirect: "follow",
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch URL: HTTP ${resp.status}`);
  }
  const contentType = resp.headers.get("content-type") || "";
  const body = await resp.text();
  const text = contentType.includes("text/plain") ? body : stripHtml(body);
  if (!text.trim()) {
    throw new Error("No readable text content found at the provided URL.");
  }
  return text.length > MAX_SOURCE_CHARS
    ? text.slice(0, MAX_SOURCE_CHARS) + "\n\n[Content truncated]"
    : text;
}

function buildPrompt(args: {
  sectionKey: SectionKey;
  url: string;
  actorName: string;
  actorDescription?: string | null;
  country?: string | null;
  existingItems: string[];
  extractedText: string;
}) {
  const cfg = SECTION_CONFIG[args.sectionKey];
  const existing =
    args.existingItems.length > 0 ? args.existingItems.join(", ") : "(none)";
  return `You are extracting ${cfg.description} from a company's web page for the NEXUS discovery platform.

Company: ${args.actorName}
${args.actorDescription ? `Description: ${args.actorDescription}\n` : ""}${args.country ? `Country: ${args.country}\n` : ""}Source URL: ${args.url}

Source text (truncated):
---
${args.extractedText}
---

Already on file (do not propose duplicates):
${existing}

Your task: identify ${cfg.noun} this company has based on the source text.
${cfg.guidance}

Rules:
- Only propose items that are clearly supported by the source text.
- Each proposal must include a short evidence quote or paraphrase (1-2 sentences) from the source.
- Confidence: "high" if the text directly names the item; "medium" if strongly implied; "low" if inferred.
- 3-10 proposals typical. It is acceptable to return 0 if nothing relevant is found.
- Do not invent items. Do not include items that are obviously unrelated to this company.
- Do not propose items already in the "Already on file" list.

Respond using the submit_proposals tool.`;
}

async function callAi(prompt: string, lovableApiKey: string) {
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4096,
    tools: [PROPOSALS_TOOL_SCHEMA],
    tool_choice: { type: "function", function: { name: "submit_proposals" } },
  };
  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const errText = await resp.text();
    if (resp.status === 429) {
      throw new Error("Rate limit reached. Please try again in a moment.");
    }
    if (resp.status === 402) {
      throw new Error(
        "AI credits exhausted. Add funds in workspace settings.",
      );
    }
    throw new Error(`AI gateway error ${resp.status}: ${errText}`);
  }
  const result = await resp.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("AI did not return proposals");
  }
  return JSON.parse(toolCall.function.arguments);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, section_key, actor_context, existing_items } = await req.json();

    // Validate
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "URL must be a valid http(s) URL" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!section_key || !(section_key in SECTION_CONFIG)) {
      return new Response(
        JSON.stringify({ error: "Invalid section_key" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!actor_context || typeof actor_context.actor_name !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing actor_context.actor_name" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract text
    let extractedText: string;
    try {
      extractedText = await fetchUrlText(url);
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: `Failed to extract content from URL: ${(e as Error).message}`,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const existingList: string[] = Array.isArray(existing_items)
      ? existing_items.filter((s: unknown): s is string => typeof s === "string")
      : [];

    const prompt = buildPrompt({
      sectionKey: section_key,
      url,
      actorName: actor_context.actor_name,
      actorDescription: actor_context.actor_description ?? null,
      country: actor_context.country ?? null,
      existingItems: existingList,
      extractedText,
    });

    let aiResult: { proposals?: unknown; extraction_summary?: string };
    try {
      aiResult = await callAi(prompt, lovableApiKey);
    } catch (e) {
      // Single retry with stricter reminder
      try {
        aiResult = await callAi(
          prompt + "\n\nReminder: respond ONLY via the submit_proposals tool with valid arguments.",
          lovableApiKey,
        );
      } catch (e2) {
        return new Response(
          JSON.stringify({ error: (e2 as Error).message }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const rawProposals = Array.isArray(aiResult.proposals)
      ? (aiResult.proposals as Array<Record<string, unknown>>)
      : [];

    const existingLower = new Set(
      existingList.map((s) => s.trim().toLowerCase()),
    );

    const proposals = rawProposals
      .map((p) => ({
        entry_name: typeof p.entry_name === "string" ? p.entry_name.trim() : "",
        evidence: typeof p.evidence === "string" ? p.evidence : "",
        confidence:
          p.confidence === "high" || p.confidence === "medium" || p.confidence === "low"
            ? p.confidence
            : "medium",
      }))
      .filter(
        (p) =>
          p.entry_name.length > 0 &&
          !existingLower.has(p.entry_name.toLowerCase()),
      );

    return new Response(
      JSON.stringify({
        proposals,
        source_url: url,
        extraction_summary:
          typeof aiResult.extraction_summary === "string"
            ? aiResult.extraction_summary
            : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Enrichment failed: ${(err as Error).message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
