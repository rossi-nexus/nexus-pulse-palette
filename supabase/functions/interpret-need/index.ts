import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the interpretation engine for æXs NEXUS, a discovery platform for defense, security, infrastructure, and dual-use technology.

Analyze the user's need description and produce a structured interpretation that drives a multi-role actor discovery search.

## Input format

You receive:
1. USER INPUT — the need description text, possibly including content extracted from attached documents and URLs
2. ONTOLOGY — the complete active ontology with entry IDs and names, organized by category type

## Rules

### Summary
- 3-6 points. Each captures a distinct aspect of the need.
- Be specific and strategic, not generic. Reference the actual domain and requirements.

### Roles
- 3-7 roles. Each represents a distinct type of actor (company/organization) to search for.
- Decomposition approach: start with domain segmentation (land/sea/air/cyber/space if multi-domain), then enabling layers (C2, communications, integration), then services (managed operations, training) if explicitly requested.
- Each role drives a separate search — roles should not overlap significantly.
- Return roles in suggested priority order (most critical first). The user will be able to reorder.
- Role names should be clear and industry-meaningful.

### Ontology selection
- You MUST select entries using the exact IDs provided in the ontology lists.
- For each role, select relevant entries from the 5 categories. A role does not need selections in all 5 — only select where genuinely relevant.
- If the need requires a concept NOT in the provided ontology, or if existing entries are too generic for the specific need, add more precise terms to the role's "proposed_new" array. The ontology grows through use — proposals are how it learns. Do not force-fit a search into existing categories when a more specific or accurate term would serve the search better. You may BOTH select an existing broad entry AND propose a more specific one (e.g., select "Radar" from the ontology AND propose "Ground Penetrating Radar" if the search specifically needs it).
- Never invent IDs. Use only IDs from the provided lists or the proposal mechanism.

For each role, actively consider all 5 category types when selecting ontology entries:
- **Capabilities**: what technical abilities are needed (e.g., radar detection, signal processing)
- **Competences**: what professional expertise is needed (e.g., systems engineering, project management)
- **Domains**: what operational environments apply (e.g., Maritime, Arctic Operations)
- **Product types**: what tangible systems, equipment, or deliverables are implied (e.g., Radar, Camera system, UAV). If the need mentions "systems", "solutions", "equipment", or "platforms", product types should be selected.
- **Service types**: what professional services are sought (e.g., Systems integration, Maintenance & repair, Training & education). If the need mentions "expertise", "operation", "management", or "support", service types should be selected.

Do not leave product_types or service_types empty when the need text implies physical deliverables or operational services. Most real procurement needs involve both products and services.

### Constraints
- Only extract constraints actually stated or clearly implied in the input text.
- Omit constraint fields that have no relevant information (do not include empty or null fields — just leave them out of the object).
- geography.countries uses ISO 3166-1 alpha-2 codes.
- security_classification.required_level means: actors at this level or above qualify.

### Clarification points
- 2-4 genuine ambiguities or things worth considering.
- These help the user refine, not block progress. Frame as considerations, not demands.
- Domain-specific insights the user might not have thought of are especially valuable.

### General
- Each search is unique. Do not force needs into templates.
- The output structure is fixed but the content is entirely driven by the specific input.
- Every role must include its reasoning field.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_interpretation",
    description: "Submit the structured interpretation of the user's need.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "One key point about the need (1-2 sentences)" },
            },
            required: ["text"],
          },
          description: "3-6 summary points capturing distinct aspects of the need",
        },
        roles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Descriptive role name" },
              reasoning: { type: "string", description: "2-3 sentences: why this role exists" },
              targets: {
                type: "object",
                properties: {
                  capabilities: { type: "array", items: { type: "string" }, description: "Ontology entry IDs" },
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
              dependencies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    depends_on_role_name: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["depends_on_role_name", "description"],
                },
              },
            },
            required: ["name", "reasoning", "targets"],
          },
          description: "3-7 roles representing distinct actor types to search for",
        },
        constraints: {
          type: "object",
          properties: {
            geography: {
              type: "object",
              properties: {
                countries: { type: "array", items: { type: "string" } },
                regions: { type: "array", items: { type: "string" } },
                cities: { type: "array", items: { type: "string" } },
              },
            },
            company_size: { type: "string" },
            security_classification: {
              type: "object",
              properties: { required_level: { type: "string" } },
            },
            readiness: {
              type: "object",
              properties: {
                max_response_time: { type: "string" },
                description: { type: "string" },
              },
            },
            capacity: {
              type: "object",
              properties: {
                description: { type: "string" },
                min_value: { type: "number" },
                max_value: { type: "number" },
                unit: { type: "string" },
              },
            },
            standards: {
              type: "object",
              properties: {
                required: { type: "array", items: { type: "string" } },
                preferred: { type: "array", items: { type: "string" } },
              },
            },
            contract_duration: {
              type: "object",
              properties: { duration: { type: "string" } },
            },
            search_context: { type: "string" },
          },
        },
        clarification_points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              context: { type: "string" },
            },
            required: ["question", "context"],
          },
          description: "2-4 genuine ambiguities or considerations",
        },
      },
      required: ["summary", "roles", "constraints", "clarification_points"],
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

    const { need_description } = await req.json();
    if (!need_description) {
      return new Response(JSON.stringify({ error: "Missing need_description" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step A — Extract content from attachments
    const extractedTexts: string[] = [];
    const extractionErrors: string[] = [];

    for (const att of need_description.attachments || []) {
      try {
        if (att.type === "file" && att.storage_path) {
          const { data: fileData, error: dlError } = await supabase.storage
            .from("need-attachments")
            .download(att.storage_path);
          if (dlError || !fileData) {
            extractionErrors.push(`Failed to download ${att.reference}: ${dlError?.message}`);
            continue;
          }
          // Call extract-file-text edge function
          const formData = new FormData();
          formData.append("file", new File([fileData], att.reference));
          const extractResp = await fetch(`${supabaseUrl}/functions/v1/extract-file-text`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseServiceKey}` },
            body: formData,
          });
          if (extractResp.ok) {
            const { text } = await extractResp.json();
            if (text) extractedTexts.push(`EXTRACTED FROM: ${att.reference}\n${text}`);
          } else {
            extractionErrors.push(`Failed to extract text from ${att.reference}`);
          }
        } else if (att.type === "url") {
          const extractResp = await fetch(`${supabaseUrl}/functions/v1/extract-url-text`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: att.reference }),
          });
          if (extractResp.ok) {
            const { text } = await extractResp.json();
            if (text) extractedTexts.push(`EXTRACTED FROM: ${att.reference}\n${text}`);
          } else {
            extractionErrors.push(`Failed to extract content from ${att.reference}`);
          }
        }
      } catch (e) {
        extractionErrors.push(`Error processing ${att.reference}: ${e.message}`);
      }
    }

    // Step B — Combine inputs
    const contextText = need_description.context_text || "(No context text provided)";
    let combinedInput = `USER CONTEXT:\n${contextText}`;
    for (const et of extractedTexts) {
      combinedInput += `\n\n${et}`;
    }

    if (contextText === "(No context text provided)" && extractedTexts.length === 0) {
      return new Response(JSON.stringify({ error: "No input content available. Provide context text or valid attachments." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step C — Fetch active ontology
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

    // Group entries by category type
    const categoryMap = new Map(categories.map((c: any) => [c.id, c]));
    const typeGroups: Record<string, { category: any; entries: any[] }[]> = {};

    for (const cat of categories) {
      if (!typeGroups[cat.type]) typeGroups[cat.type] = [];
      typeGroups[cat.type].push({
        category: cat,
        entries: entries.filter((e: any) => e.category_id === cat.id),
      });
    }

    // Also add entries without category (flat types like product_types, service_types)
    const uncategorizedEntries = entries.filter((e: any) => !e.category_id);

    // Build ontology text for prompt
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
      const groups = typeGroups[type] || [];
      if (groups.length > 0) {
        for (const g of groups) {
          ontologyText += `Category: "${g.category.normalized_name}" (id: ${g.category.id})\n`;
          for (const e of g.entries) {
            ontologyText += `  - "${e.raw_name}" (id: ${e.id})\n`;
          }
        }
      }
      // Add uncategorized entries of this type (check by matching type conventions)
      const flatEntries = uncategorizedEntries.filter((e: any) => {
        // Entries without category — check if any category of this type exists
        // Actually, flat entries belong to categories; if no category, they're orphans
        return false;
      });
    }

    const userMessage = `${combinedInput}\n\n---\n\nONTOLOGY:\n${ontologyText}`;

    // Step D — Call AI (try tool calling first, fall back to JSON mode)
    async function callAI(useToolCalling: boolean) {
      const body: any = {
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + (useToolCalling ? "" : "\n\nReturn ONLY valid JSON matching the described output format. No markdown fences, no explanation.") },
          { role: "user", content: userMessage },
        ],
        max_tokens: 16384,
        reasoning: { effort: "high" },
      };
      if (useToolCalling) {
        body.tools = [TOOL_SCHEMA];
        body.tool_choice = { type: "function", function: { name: "submit_interpretation" } };
      }
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    let parsed: any = null;

    // Attempt 1: tool calling
    const aiResponse1 = await callAI(true);
    if (!aiResponse1.ok) {
      const errText = await aiResponse1.text();
      console.error("AI gateway error:", aiResponse1.status, errText);
      if (aiResponse1.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse1.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult1 = await aiResponse1.json();
    const toolCall = aiResult1.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse tool call arguments, will retry with JSON mode");
      }
    }

    // Check for MALFORMED_FUNCTION_CALL or missing tool call — retry with JSON mode
    if (!parsed) {
      const finishReason = aiResult1.choices?.[0]?.finish_reason;
      console.log("Tool calling failed (finish_reason:", finishReason, "), retrying with JSON mode...");

      const aiResponse2 = await callAI(false);
      if (!aiResponse2.ok) {
        const errText = await aiResponse2.text();
        console.error("AI JSON mode error:", aiResponse2.status, errText);
        return new Response(JSON.stringify({ error: "AI processing failed on retry" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult2 = await aiResponse2.json();
      let content = aiResult2.choices?.[0]?.message?.content || "";
      // Strip markdown fences if present
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        console.error("Failed to parse JSON from AI content:", content.slice(0, 500));
        return new Response(JSON.stringify({ error: "AI returned unparseable response after retry" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step E — Transform response
    const entryMap = new Map(entries.map((e: any) => [e.id, e]));
    const interpretationId = crypto.randomUUID();

    // Build summary points
    const summary = (parsed.summary || []).map((s: any) => ({
      id: crypto.randomUUID(),
      text: s.text,
      source: "axis" as const,
      status: "pending" as const,
    }));

    // Build role name->id map for dependencies
    const roleNameToId = new Map<string, string>();
    const roleIds: string[] = [];
    for (const r of parsed.roles || []) {
      const rid = crypto.randomUUID();
      roleNameToId.set(r.name, rid);
      roleIds.push(rid);
    }

    // Build ontology selections helper
    const buildSelections = (selectedIds: string[], categoryType: string) => {
      const selections: any[] = [];
      const selectedSet = new Set(selectedIds || []);

      // Add selected entries
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
            source: "axis",
            status: "pending",
          });
        }
      }

      // Add unselected available entries of this category type
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
              source: "axis",
              status: "accepted",
            });
          }
        }
      }

      return selections;
    };

    // Build roles
    const roles = (parsed.roles || []).map((r: any, i: number) => {
      const roleId = roleIds[i];

      // Handle proposed new items
      const proposedNew = (r.proposed_new || []).map((p: any) => {
        const catType = p.category_type === "product_types" ? "productTypes"
          : p.category_type === "service_types" ? "serviceTypes"
          : p.category_type;
        return {
          id: crypto.randomUUID(),
          entryId: `proposed-${crypto.randomUUID()}`,
          rawName: p.proposed_name,
          categoryType: catType,
          selected: true,
          source: "axis" as const,
          status: "pending" as const,
          is_proposed_new: true,
          proposed_name: p.proposed_name,
        };
      });

      // Group proposed by category type
      const proposedByType: Record<string, any[]> = {};
      for (const p of proposedNew) {
        if (!proposedByType[p.categoryType]) proposedByType[p.categoryType] = [];
        proposedByType[p.categoryType].push(p);
      }

      const targets = {
        capabilities: [...buildSelections(r.targets?.capabilities || [], "capabilities"), ...(proposedByType["capabilities"] || [])],
        competences: [...buildSelections(r.targets?.competences || [], "competences"), ...(proposedByType["competences"] || [])],
        domains: [...buildSelections(r.targets?.domains || [], "domains"), ...(proposedByType["domains"] || [])],
        productTypes: [...buildSelections(r.targets?.product_types || [], "productTypes"), ...(proposedByType["productTypes"] || [])],
        serviceTypes: [...buildSelections(r.targets?.service_types || [], "serviceTypes"), ...(proposedByType["serviceTypes"] || [])],
      };

      // Build dependencies
      const dependencies = (r.dependencies || []).map((d: any) => ({
        id: crypto.randomUUID(),
        depends_on_role_id: roleNameToId.get(d.depends_on_role_name) || "",
        depends_on_role_name: d.depends_on_role_name,
        description: d.description,
      }));

      return {
        id: roleId,
        label: r.name,
        description: r.reasoning,
        reasoning: r.reasoning,
        targets,
        constraints: {},
        dependencies,
        priority: i + 1,
        source: "axis" as const,
        status: "pending" as const,
      };
    });

    // Build constraints
    const constraints = parsed.constraints || {};

    // Add extraction errors to clarification points
    const clarificationPoints = [...(parsed.clarification_points || [])];
    for (const err of extractionErrors) {
      clarificationPoints.push({
        question: `Attachment extraction issue: ${err}`,
        context: "Some content could not be extracted and was not included in the analysis.",
      });
    }

    const interpretation = {
      id: interpretationId,
      summary,
      roles,
      constraints,
    };

    return new Response(
      JSON.stringify({ interpretation, clarification_points: clarificationPoints }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("interpret-need error:", err);
    return new Response(
      JSON.stringify({ error: `Interpretation failed: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
