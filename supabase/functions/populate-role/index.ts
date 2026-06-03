import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { buildOntologyBlock } from "../_shared/ontology-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are populating the search targets for a SINGLE role added manually by the user in æXs NEXUS, a discovery platform for defence, security, infrastructure, and dual-use technology.

LANGUAGE: All output MUST be in English. Translate any non-English source to clear professional English. Proper nouns stay as-is.

The user has already gone through interpretation and now wants to add an additional role to broaden or refine the search. Your job is to:

1. Write a 1-2 sentence role description (what type of actor this role represents).
2. Write a 2-3 sentence reasoning (why this role exists in the context of the user's need).
3. Select relevant ontology entries across all 5 categories: capabilities, competences, domains, product types, service types. Use ONLY the entry IDs provided. A role does not need selections in all 5 — only select where genuinely relevant.
4. If the role requires concepts NOT in the provided ontology, propose new items in the proposed_new array.

Important:
- Do NOT duplicate the focus of existing roles already covered by the interpretation. The user explicitly added this role to fill a gap or add a distinct angle.
- Keep selections precise. Do not flood the role with every loosely-related entry.
- Use ontology entries by their ID, not by name.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_role",
    description: "Submit the populated role data.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "1-2 sentence role description" },
        reasoning: { type: "string", description: "2-3 sentence reasoning for why this role exists" },
        targets: {
          type: "object",
          properties: {
            capabilities: { type: "array", items: { type: "string" } },
            competences: { type: "array", items: { type: "string" } },
            domains: { type: "array", items: { type: "string" } },
            product_types: { type: "array", items: { type: "string" } },
            service_types: { type: "array", items: { type: "string" } },
          },
          required: ["capabilities", "competences", "domains", "product_types", "service_types"],
        },
        proposed_new: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category_type: { type: "string", enum: ["capabilities", "competences", "domains", "product_types", "service_types"] },
              proposed_name: { type: "string" },
              proposed_category_id: { type: "string", description: "UUID of the sub-category from the ONTOLOGY block this proposal best fits under." },
              matched_entry_id: { type: "string", description: "Optional: UUID of an existing entry from the ONTOLOGY block if the proposed name closely matches it. Prefer mapping over proposing when the match is strong." },
            },
            required: ["category_type", "proposed_name"],
          },
        },
      },
      required: ["description", "reasoning", "targets"],
    },
  },
};

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { role_name, context_text, existing_roles } = await req.json();
    if (!role_name || typeof role_name !== "string") {
      return new Response(JSON.stringify({ error: "Missing role_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ontology
    const { data: categories } = await supabase
      .from("ontology_categories")
      .select("*")
      .eq("status", "active")
      .order("sort_order");

    const { data: entries } = await supabase
      .from("ontology_entries")
      .select("*")
      .eq("status", "active")
      .order("sort_order");

    if (!categories || !entries) {
      return new Response(JSON.stringify({ error: "Failed to load ontology" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ontologyText = "\n" + buildOntologyBlock(categories as any, entries as any);
    console.log(`[populate-role] ontology prompt block chars: ${ontologyText.length}`);

    const existingRolesText = (existing_roles || [])
      .map((r: any, i: number) => `  ${i + 1}. ${r.name}`)
      .join("\n") || "  (none)";

    const userMessage = `USER ORIGINAL NEED:
${context_text || "(no original context provided)"}

EXISTING ROLES already in the interpretation:
${existingRolesText}

NEW ROLE TO POPULATE:
"${role_name}"

ONTOLOGY:${ontologyText}

Generate description, reasoning, and ontology targets for the new role above. Do not duplicate the focus of existing roles.

When you fill proposed_new[], you MUST also include proposed_category_id (UUID of the sub-category from the ONTOLOGY block that the proposal best fits under). Optionally include matched_entry_id (UUID of an existing entry in the ONTOLOGY block) when the proposed name closely matches an existing entry — prefer mapping over proposing in that case.`;

    // AI call helper — throws on HTTP failure or missing/malformed tool output.
    // Special-cases 429/402 by surfacing them with explicit codes.
    async function callAI(extraSystemSuffix = "") {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + extraSystemSuffix },
            { role: "user", content: userMessage },
          ],
          max_tokens: 4096,
          tools: [TOOL_SCHEMA],
          tool_choice: { type: "function", function: { name: "submit_role" } },
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        if (resp.status === 429) {
          const e = new Error("Rate limit reached. Please try again in a moment.");
          (e as any).upstreamStatus = 429;
          throw e;
        }
        if (resp.status === 402) {
          const e = new Error("AI credits exhausted. Add funds in workspace settings.");
          (e as any).upstreamStatus = 402;
          throw e;
        }
        throw new Error(`AI gateway error ${resp.status}: ${errText.slice(0, 200)}`);
      }
      const result = await resp.json();
      const tc = result.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc?.function?.arguments) {
        throw new Error("AI did not return structured output");
      }
      return JSON.parse(tc.function.arguments);
    }

    let parsed: any;
    try {
      parsed = await callAI();
    } catch (e1) {
      // Surface explicit upstream codes immediately (no retry on 429/402)
      const upstream = (e1 as any).upstreamStatus;
      if (upstream === 429 || upstream === 402) {
        return new Response(JSON.stringify({ error: (e1 as Error).message }), {
          status: upstream,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Single retry with stricter reminder (matches reference pattern)
      try {
        parsed = await callAI(
          "\n\nReminder: respond ONLY via the submit_role tool with valid arguments.",
        );
      } catch (e2) {
        const upstream2 = (e2 as any).upstreamStatus;
        if (upstream2 === 429 || upstream2 === 402) {
          return new Response(JSON.stringify({ error: (e2 as Error).message }), {
            status: upstream2,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error("populate-role AI failed after retry:", e2);
        return new Response(JSON.stringify({ error: (e2 as Error).message }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build ontology selections (mirrors interpret-need's buildSelections)
    const entryMap = new Map(entries.map((e: any) => [e.id, e]));
    const categoryMap = new Map(categories.map((c: any) => [c.id, c]));

    const buildSelections = (selectedIds: string[], categoryType: string) => {
      const selections: any[] = [];
      const selectedSet = new Set(selectedIds || []);

      for (const eid of selectedIds || []) {
        const entry = entryMap.get(eid);
        if (entry) {
          const cat = entry.category_id ? categoryMap.get(entry.category_id) : null;
          selections.push({
            id: crypto.randomUUID(),
            entryId: eid,
            rawName: entry.raw_name,
            categoryName: cat?.normalized_name,
            categoryType,
            selected: true,
            source: "manual",
            status: "accepted",
          });
        }
      }

      const typeKey = categoryType === "productTypes" ? "product_type"
        : categoryType === "serviceTypes" ? "service_type"
        : categoryType === "capabilities" ? "capability"
        : categoryType === "competences" ? "competence"
        : categoryType === "domains" ? "domain"
        : categoryType;

      const relevantCategories = categories.filter((c: any) => c.type === typeKey);
      for (const cat of relevantCategories) {
        const catEntries = entries.filter((e: any) => e.category_id === cat.id);
        for (const e of catEntries) {
          if (!selectedSet.has(e.id)) {
            selections.push({
              id: crypto.randomUUID(),
              entryId: e.id,
              rawName: e.raw_name,
              categoryName: cat.normalized_name,
              categoryType,
              selected: false,
              source: "manual",
              status: "accepted",
            });
          }
        }
      }
      return selections;
    };

    // Handle proposed new items
    const proposedNew = (parsed.proposed_new || []).map((p: any) => {
      const catType = p.category_type === "product_types" ? "productTypes"
        : p.category_type === "service_types" ? "serviceTypes"
        : p.category_type;
      const proposed_category_id = typeof p.proposed_category_id === "string" && p.proposed_category_id ? p.proposed_category_id : undefined;
      const matched_entry_id = typeof p.matched_entry_id === "string" && p.matched_entry_id ? p.matched_entry_id : undefined;
      return {
        id: crypto.randomUUID(),
        entryId: `proposed-${crypto.randomUUID()}`,
        rawName: p.proposed_name,
        categoryType: catType,
        selected: true,
        source: "manual" as const,
        status: "accepted" as const,
        is_proposed_new: true,
        proposed_name: p.proposed_name,
        ...(proposed_category_id ? { proposed_category_id } : {}),
        ...(matched_entry_id ? { matched_entry_id } : {}),
      };
    });

    const proposedByType: Record<string, any[]> = {};
    for (const p of proposedNew) {
      if (!proposedByType[p.categoryType]) proposedByType[p.categoryType] = [];
      proposedByType[p.categoryType].push(p);
    }

    const targets = {
      capabilities: [...buildSelections(parsed.targets?.capabilities || [], "capabilities"), ...(proposedByType["capabilities"] || [])],
      competences: [...buildSelections(parsed.targets?.competences || [], "competences"), ...(proposedByType["competences"] || [])],
      domains: [...buildSelections(parsed.targets?.domains || [], "domains"), ...(proposedByType["domains"] || [])],
      productTypes: [...buildSelections(parsed.targets?.product_types || [], "productTypes"), ...(proposedByType["productTypes"] || [])],
      serviceTypes: [...buildSelections(parsed.targets?.service_types || [], "serviceTypes"), ...(proposedByType["serviceTypes"] || [])],
    };

    return new Response(JSON.stringify({
      description: parsed.description || "",
      reasoning: parsed.reasoning || "",
      targets,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("populate-role error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
