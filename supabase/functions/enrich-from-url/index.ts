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

// Maps wizard section_key → ontology_categories.type
const SECTION_TO_TYPE: Record<SectionKey, string> = {
  capabilities: "capability",
  competences: "competence",
  domains: "domain",
  products: "product_type",
  services: "service_type",
};

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
              entry_name: { type: "string", description: "The name of the capability/competence/etc. If you are mapping to an existing ontology entry, use that entry's exact raw_name. If you are proposing a new entry, this is your suggested name." },
              evidence: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              matched_entry_id: { type: "string", description: "If this proposal corresponds to an existing ontology entry (case-insensitive name match or strong semantic match within a category), include that entry's id here. Omit or set to null if this is a genuinely new concept." },
              proposed_category_id: { type: "string", description: "Required when matched_entry_id is not set. The id of the existing sub-category this new entry should live under." },
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

import {
  buildOntologyBlock,
  type OntoCategory,
  type OntoEntry,
} from "../_shared/ontology-prompt.ts";

function buildPrompt(args: {
  sectionKey: SectionKey;
  url: string;
  actorName: string;
  actorDescription?: string | null;
  country?: string | null;
  existingItems: string[];
  extractedText: string;
  ontologyBlock: string;
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

Available ontology for this section (sub-categories and their existing entries):
${args.ontologyBlock}

Your task: identify ${cfg.noun} this company has based on the source text.
${cfg.guidance}

Rules:
- Only propose items that are clearly supported by the source text.
- Each proposal must include a short evidence quote or paraphrase (1-2 sentences) from the source.
- Confidence: "high" if the text directly names the item; "medium" if strongly implied; "low" if inferred.
- 3-10 proposals typical. It is acceptable to return 0 if nothing relevant is found.
- Do not invent items. Do not include items that are obviously unrelated to this company.
- Do not propose items already in the "Already on file" list.
- For each proposal, decide:
    * If it clearly corresponds to an existing entry above (same concept, name match or strong semantic equivalent), set "matched_entry_id" to that entry's id and use that entry's exact raw_name as entry_name.
    * Otherwise it's a NEW concept: omit matched_entry_id, set "proposed_category_id" to the id of the sub-category it best fits under, and use your suggested name as entry_name.
- A proposal must have either matched_entry_id OR proposed_category_id — never both, never neither.

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

    // Load ontology for this section_key (the user's JWT honours RLS — active rows only).
    const categoryType = SECTION_TO_TYPE[section_key as SectionKey];
    const { data: catRows, error: catErr } = await supabaseAuth
      .from("ontology_categories")
      .select("id, normalized_name, description, keywords, example_entries, co_occurring_category_ids")
      .eq("type", categoryType)
      .eq("status", "active")
      .order("sort_order");
    if (catErr) throw new Error(`Failed to load ontology categories: ${catErr.message}`);
    const categories = (catRows ?? []) as Array<OntoCategory & { co_occurring_category_ids: string[] }>;
    const categoryIds = categories.map((c) => c.id);
    const { data: entryRows, error: entErr } = categoryIds.length
      ? await supabaseAuth
          .from("ontology_entries")
          .select("id, raw_name, category_id")
          .in("category_id", categoryIds)
          .eq("status", "active")
          .order("raw_name")
      : { data: [] as OntoEntry[], error: null };
    if (entErr) throw new Error(`Failed to load ontology entries: ${entErr.message}`);
    const entries = (entryRows ?? []) as OntoEntry[];

    // Resolve all referenced category names (for co_occurring chip labels in the
    // wizard response payload AND for cross-section name resolution in the prompt block).
    const { data: allCatRows } = await supabaseAuth
      .from("ontology_categories")
      .select("id, normalized_name, type")
      .eq("status", "active");
    const allCats = (allCatRows ?? []) as Array<{ id: string; normalized_name: string; type: string }>;
    const catNameById = new Map<string, { name: string; type: string }>();
    for (const c of allCats) {
      catNameById.set(c.id, { name: c.normalized_name, type: c.type });
    }

    const ontologyBlock = buildOntologyBlock(
      categories as unknown as OntoCategory[],
      entries,
      {
        groupByType: false,
        nameLookupCategories: allCats,
      },
    );

    const prompt = buildPrompt({
      sectionKey: section_key,
      url,
      actorName: actor_context.actor_name,
      actorDescription: actor_context.actor_description ?? null,
      country: actor_context.country ?? null,
      existingItems: existingList,
      extractedText,
      ontologyBlock,
    });

    let aiResult: { proposals?: unknown; extraction_summary?: string };
    try {
      aiResult = await callAi(prompt, lovableApiKey);
    } catch (_e) {
      try {
        aiResult = await callAi(
          prompt + "\n\nReminder: respond ONLY via the submit_proposals tool with valid arguments.",
          lovableApiKey,
        );
      } catch (e2) {
        return new Response(
          JSON.stringify({ error: (e2 as Error).message }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const rawProposals = Array.isArray(aiResult.proposals)
      ? (aiResult.proposals as Array<Record<string, unknown>>)
      : [];

    const existingLower = new Set(existingList.map((s) => s.trim().toLowerCase()));
    const entryByName = new Map<string, OntoEntry>();
    const entryById = new Map<string, OntoEntry>();
    for (const e of entries) {
      entryByName.set(e.raw_name.trim().toLowerCase(), e);
      entryById.set(e.id, e);
    }
    const catById = new Map<string, OntoCategory & { co_occurring_category_ids: string[] }>();
    for (const c of categories) catById.set(c.id, c);

    const proposals = rawProposals
      .map((p) => {
        const entry_name = typeof p.entry_name === "string" ? p.entry_name.trim() : "";
        const evidence = typeof p.evidence === "string" ? p.evidence : "";
        const confidence: "high" | "medium" | "low" =
          p.confidence === "high" || p.confidence === "medium" || p.confidence === "low"
            ? p.confidence
            : "medium";
        let matched_entry_id =
          typeof p.matched_entry_id === "string" && p.matched_entry_id ? p.matched_entry_id : null;
        let proposed_category_id =
          typeof p.proposed_category_id === "string" && p.proposed_category_id
            ? p.proposed_category_id
            : null;

        // Safety net: if the AI omitted matched_entry_id but the name exactly
        // matches an existing entry within this section, treat it as matched.
        if (!matched_entry_id) {
          const hit = entryByName.get(entry_name.toLowerCase());
          if (hit) matched_entry_id = hit.id;
        }
        // Validate matched_entry_id belongs to this section's entries
        if (matched_entry_id && !entryById.has(matched_entry_id)) {
          matched_entry_id = null;
        }
        // Validate proposed_category_id belongs to this section
        if (proposed_category_id && !catById.has(proposed_category_id)) {
          proposed_category_id = null;
        }

        const is_proposed_new = !matched_entry_id;
        // If proposed-new but no valid category, fall back to first category to
        // avoid dropping the signal entirely; wizard lets the consultant retarget.
        if (is_proposed_new && !proposed_category_id && categories.length > 0) {
          proposed_category_id = categories[0].id;
        }

        // Attach category metadata for the wizard UI
        let proposed_category_meta: Record<string, unknown> | null = null;
        if (is_proposed_new && proposed_category_id) {
          const c = catById.get(proposed_category_id)!;
          proposed_category_meta = {
            id: c.id,
            normalized_name: c.normalized_name,
            description: c.description,
            keywords: c.keywords ?? [],
            example_entries: c.example_entries ?? [],
            co_occurring: (c.co_occurring_category_ids ?? [])
              .map((id) => {
                const m = catNameById.get(id);
                return m ? { id, name: m.name, type: m.type } : null;
              })
              .filter(Boolean),
          };
        }

        return {
          entry_name,
          evidence,
          confidence,
          matched_entry_id,
          is_proposed_new,
          proposed_category_id,
          proposed_category_meta,
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
