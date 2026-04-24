import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RESULTS = 10;

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
              source_index: {
                type: "integer",
                description:
                  "1-based index of the search result that supports this proposal.",
              },
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

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

function buildPrompt(args: {
  sectionKey: SectionKey;
  query: string;
  actorName: string;
  actorDescription?: string | null;
  country?: string | null;
  existingItems: string[];
  results: SearchResult[];
}) {
  const cfg = SECTION_CONFIG[args.sectionKey];
  const existing =
    args.existingItems.length > 0 ? args.existingItems.join(", ") : "(none)";
  const resultsBlock = args.results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n    ${r.snippet}\n    (${r.link})`,
    )
    .join("\n\n");
  return `You are extracting ${cfg.description} for the NEXUS discovery platform from web search results.

Company: ${args.actorName}
${args.actorDescription ? `Description: ${args.actorDescription}\n` : ""}${args.country ? `Country: ${args.country}\n` : ""}Source: Web search results for query "${args.query}"

Search results:
${resultsBlock}

Already on file (do not propose duplicates):
${existing}

Your task: identify ${cfg.noun} this company has based on the search results above.
${cfg.guidance}

Rules:
- Only propose items clearly supported by the snippets.
- Each proposal must include:
  - a short evidence quote or paraphrase (1-2 sentences)
  - the source_index number (e.g. 1, 2) identifying which result supports it
- Confidence: "high" if text directly names the item; "medium" if strongly implied; "low" if inferred.
- 3-10 proposals typical. 0 is acceptable if nothing relevant.
- Do not invent items. Do not propose items already in "Already on file".

Be extra conservative: web search results are less reliable than a company's own website.
Only propose items with clear, specific evidence. When in doubt, skip.

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
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const serperApiKey = Deno.env.get("SERPER_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!serperApiKey) {
      return new Response(
        JSON.stringify({ error: "SERPER_API_KEY not configured" }),
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

    const { query, section_key, actor_context, existing_items } =
      await req.json();

    // Validate
    const trimmedQuery =
      typeof query === "string" ? query.trim() : "";
    if (trimmedQuery.length < 3) {
      return new Response(
        JSON.stringify({
          error: "Query must be at least 3 characters.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!section_key || !(section_key in SECTION_CONFIG)) {
      return new Response(JSON.stringify({ error: "Invalid section_key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // === Serper call ===
    let serperResp: Response;
    try {
      serperResp = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: trimmedQuery, num: MAX_RESULTS }),
      });
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: `Web search request failed: ${(e as Error).message}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (serperResp.status === 429) {
      return new Response(
        JSON.stringify({
          error: "Web search rate limit reached. Try again in a moment.",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!serperResp.ok) {
      const errText = await serperResp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Web search error ${serperResp.status}: ${errText.slice(0, 200)}`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const serperData = await serperResp.json().catch(() => ({}));
    const organicRaw = Array.isArray(serperData?.organic)
      ? (serperData.organic as Array<Record<string, unknown>>)
      : [];

    const totalResults = organicRaw.length;
    const results: SearchResult[] = organicRaw
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: typeof r.title === "string" ? r.title : "",
        snippet: typeof r.snippet === "string" ? r.snippet : "",
        link: typeof r.link === "string" ? r.link : "",
      }))
      .filter((r) => r.link.length > 0);

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          proposals: [],
          query: trimmedQuery,
          total_results: 0,
          used_results: 0,
          extraction_summary: "No results found for this query.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existingList: string[] = Array.isArray(existing_items)
      ? existing_items.filter(
          (s: unknown): s is string => typeof s === "string",
        )
      : [];

    const prompt = buildPrompt({
      sectionKey: section_key,
      query: trimmedQuery,
      actorName: actor_context.actor_name,
      actorDescription: actor_context.actor_description ?? null,
      country: actor_context.country ?? null,
      existingItems: existingList,
      results,
    });

    let aiResult: { proposals?: unknown; extraction_summary?: string };
    try {
      aiResult = await callAi(prompt, lovableApiKey);
    } catch (_e) {
      try {
        aiResult = await callAi(
          prompt +
            "\n\nReminder: respond ONLY via the submit_proposals tool with valid arguments.",
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
      .map((p) => {
        const idxRaw = p.source_index;
        let sourceUrl: string | null = null;
        if (
          typeof idxRaw === "number" &&
          Number.isInteger(idxRaw) &&
          idxRaw >= 1 &&
          idxRaw <= results.length
        ) {
          sourceUrl = results[idxRaw - 1].link;
        }
        return {
          entry_name:
            typeof p.entry_name === "string" ? p.entry_name.trim() : "",
          evidence: typeof p.evidence === "string" ? p.evidence : "",
          confidence:
            p.confidence === "high" ||
            p.confidence === "medium" ||
            p.confidence === "low"
              ? p.confidence
              : "medium",
          source_url: sourceUrl,
        };
      })
      .filter(
        (p) =>
          p.entry_name.length > 0 &&
          !existingLower.has(p.entry_name.toLowerCase()),
      );

    return new Response(
      JSON.stringify({
        proposals,
        query: trimmedQuery,
        total_results: totalResults,
        used_results: results.length,
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
        error: `Web search enrichment failed: ${(err as Error).message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
