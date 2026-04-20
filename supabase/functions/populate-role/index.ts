import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are populating the search targets for a SINGLE role added manually by the user in æXs NEXUS, a discovery platform for defence, security, infrastructure, and dual-use technology.

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

    const typeLabels: Record<string, string> = {
      capability: "CAPABILITIES",
      competence: "COMPETENCES",
      domain: "DOMAINS",
      product_type: "PRODUCT TYPES",
      service_type: "SERVICE TYPES",
    };

    let ontologyText = "";
    for (const [type, label] of Object.entries(typeLabels)) {
      ontologyText += `\n${label}:\n`;
      const cats = categories.filter((c: any) => c.type === type);
      for (const cat of cats) {
        ontologyText += `Category: "${cat.normalized_name}" (id: ${cat.id})\n`;
        const catEntries = entries.filter((e: any) => e.category_id === cat.id);
        for (const e of catEntries) {
          ontologyText += `  - "${e.raw_name}" (id: ${e.id})\n`;
        }
      }
    }

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

Generate description, reasoning, and ontology targets for the new role above. Do not duplicate the focus of existing roles.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4096,
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "submit_role" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResp.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned no structured output" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
