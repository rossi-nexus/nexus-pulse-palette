import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { buildOntologyBlock } from "../_shared/ontology-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the interpretation engine for æXs NEXUS, a discovery platform for defense, security, infrastructure, and dual-use technology.

LANGUAGE: All output (role names, summaries, descriptions, constraint text) MUST be in English. Even if the user's input is in Norwegian/Swedish/Danish/Finnish, return everything in clear professional English. Proper nouns (company names, place names, person names, product brand names) stay as-is.

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

### CONSTRAINT EXTRACTION — CRITICAL

You MUST populate the structured constraint fields, not just mention constraints in summary prose. The downstream search system relies on these typed values.

**Security Classification:**
When the user's need mentions any security classification or clearance requirement, you MUST populate the security_classification.required_level field with the correct value. Map common terms:
- "SECRET (NO)", "Norwegian SECRET", "hemmelig" → "secret_no"
- "CONFIDENTIAL (NO)", "Norwegian CONFIDENTIAL", "konfidensielt" → "confidential_no"
- "NATO SECRET", "NS" → "nato_secret"
- "NATO CONFIDENTIAL", "NC" → "nato_confidential"
- "RESTRICTED (NO)", "begrenset" → "restricted_no"
- "NATO RESTRICTED", "NR" → "nato_restricted"
- "UNCLASSIFIED", "ugradert" → "unclassified"
If security is mentioned but the specific level is unclear, set required_level to the most likely match based on context. Do NOT leave it as "any" when the user has specified a clearance requirement.

**Contract Duration:**
When the user's need mentions a contract period, framework agreement duration, project timeline, or operational period, you MUST populate contract_duration with the typed fields:
- value (number) + unit ("month" | "year")
- type: "minimum" (e.g. "≥5 years", "at least 3 years"), "maximum" (e.g. "up to 12 months"), "fixed" (e.g. "exactly 24 months", "5-year fixed-term"), or "expected" (default when the user gives a target without explicit bound).
Examples: "5-year framework agreement" → {value: 5, unit: "year", type: "minimum"}; "12-month pilot" → {value: 12, unit: "month", type: "fixed"}. Also fill the legacy \`duration\` string with the original phrase. Do NOT only mention this in summary points — the typed fields must be filled.

**Readiness/Mobilization:**
When the user's need mentions operational deadlines, mobilization timelines, or delivery requirements (e.g., "operational within 12 months"), populate the readiness.max_response_time and readiness.description fields. Do NOT only mention this in summary points.

**Geography — Nordic context:**
When the user mentions "Nordic" in a defence/security/preparedness context, default to Norway (NO), Sweden (SE), Finland (FI), and Denmark (DK). Only include Iceland (IS) if the user explicitly mentions Iceland or if the context clearly requires it (e.g., North Atlantic maritime operations, GIUK gap).

**Capacity (team size, mobilization):**
When the user mentions team size, headcount, "X people", or capacity ("we need a supplier with at least 20 engineers"), populate capacity.min_team_size with the integer. When the user mentions response/mobilization time, convert to days and populate capacity.max_mobilization_days (e.g. "must mobilize within 1 week" → 7). Set capacity.confidence based on how directly the user stated it.

**Certifications:**
When the user mentions specific standards or certifications ("ISO 9001 required", "AQAP 2110 preferred", "NS-EN ISO 27001"), populate certifications.required and certifications.preferred with the standard names exactly. Distinguish required vs preferred from the user's wording. Set certifications.confidence.

**Language, urgency, budget:**
- Populate language.required when the user states a delivery or working language requirement.
- Populate urgency.level (low/medium/high/critical) and rationale based on time pressure cues in the text.
- Populate budget.max_eur (convert from currency_original to EUR rough estimate if not EUR) when a budget cap is mentioned.

**Sourcing Intent (SX-02):**
The user's geographic *intent* is distinct from the physical country list. Populate geography.sourcing_intent with one of: "local" (sub-national / same region), "national" (domestic sourcing required for sovereignty), "regional" (e.g. Nordic, Baltic, EU), "allied" (NATO / EU / Five Eyes / political alignment), or "unrestricted" (default — global, lowest-cost or best-fit wins).
Trigger phrases include: "sovereign", "domestic", "Norwegian-only", "norske leverandører", "nasjonal", "suverenitet", "allied partners", "NATO suppliers", "Nordic preferred", "wherever best". Default to "unrestricted" when the user does not constrain the scope. Always populate geography.sourcing_intent_rationale with a short citation of the source phrase. Do NOT auto-set sourcing_intent based on resilience posture — extract it independently from the user's own words.

**Resilience Posture (SX-02):**
Populate constraints.resilience.posture with one of: "steady_state" (default — peacetime procurement), "crisis_response" (pandemic, natural disaster, civil emergency), or "wartime_continuity" (armed conflict, sustained disruption, "must remain operational in wartime").
Trigger phrases include: "crisis", "war", "wartime", "preparedness", "totalforsvar", "beredskap", "Total Defence", "must survive disruption", "in conflict", "during armed conflict". Default to "steady_state" when unspecified. When the user names specific disruption scenarios (e.g. "GNSS jamming", "Suez closure", "pandemic"), populate constraints.resilience.scenarios with each as a string. Set constraints.resilience.confidence based on how directly stated.

**Value-Chain Sensitivity (SX-02):**
Populate constraints.value_chain when the user expresses concern about supply-chain robustness, chokepoints, or dependencies. Set value_chain.sensitive=true and add structured tags to value_chain.chokepoint_concerns from this enum: "single_source", "foreign_dependency", "transport_chokepoint", "energy", "telecom", "raw_materials".
Trigger phrases include: "supply chain", "single-source risk", "chokepoint", "foreign dependency", "rare earths", "GNSS resilience", "critical minerals". Also: when search_context = "supply_chain_analysis", default value_chain.sensitive=true. Free-form context goes in value_chain.notes. Set value_chain.confidence based on directness.

**Effect Chain (SX-02 — conditional):**
ONLY when the need is structurally sequential (e.g. sense → communicate → fuse → decide → act), propose at most ONE effect chain via the top-level effect_chains array. Each node has { role_index (0-based positional index into the roles array), stage (short label like "sense"/"decide"/"act"), stage_index (0-based order in the chain) }. Set the chain's confidence ("high"/"medium"/"low") based on how clearly the user's words imply an ordered effect. For flat market-mapping queries (e.g. "find me radar vendors in Norway"), emit no chain — leave effect_chains empty or omitted.

**Inference paths:**
For every constraint axis you populate (especially capacity, certifications, urgency, budget, language, geography, security_classification, sourcing_intent, resilience, value_chain), add an entry to inference_paths keyed by the axis name, with a short rationale citing the source phrase. Example: { "sourcing_intent": "User said 'norske leverandører' → national" }. This drives the user-facing 'Why constrained?' explanations downstream.

### SUMMARY-TO-ROLE MAPPING
For each summary point, include a "covered_by_role_indices" array containing the 0-based positional indices of roles (from the roles array you generate) that address or contribute to that summary point. A summary point may be covered by multiple roles. Every summary point should ideally be covered by at least one role. If a summary point genuinely has no covering role, that indicates a potential gap — still include the field with an empty array.
`;

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
              covered_by_role_indices: {
                type: "array",
                items: { type: "integer" },
                description: "0-based positional indices of roles (from the roles array) that address this summary point. May be empty if no role covers it.",
              },
            },
            required: ["text", "covered_by_role_indices"],
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
                    proposed_category_id: { type: "string", description: "UUID of the sub-category from the ONTOLOGY block this proposal best fits under." },
                    matched_entry_id: { type: "string", description: "Optional: UUID of an existing entry from the ONTOLOGY block if the proposed name closely matches it. Prefer using this over proposing a new name when the match is strong." },
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
                sourcing_intent: {
                  type: "string",
                  enum: ["local", "national", "regional", "allied", "unrestricted"],
                  description: "SX-02: Sourcing scope intent. Default 'unrestricted' if unspecified. Extract independently of resilience posture.",
                },
                sourcing_intent_rationale: {
                  type: "string",
                  description: "Short citation of source phrase that drove sourcing_intent.",
                },
              },
            },
            company_size: { type: "string" },
            security_classification: {
              type: "object",
              properties: {
                required_level: {
                  type: "string",
                  enum: [
                    "any",
                    "unclassified",
                    "restricted_no",
                    "nato_restricted",
                    "confidential_no",
                    "nato_confidential",
                    "secret_no",
                    "nato_secret",
                  ],
                },
              },
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
                min_team_size: { type: ["integer", "null"], description: "Minimum headcount the actor must have." },
                max_mobilization_days: { type: ["integer", "null"], description: "Maximum mobilization/response time in days." },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            standards: {
              type: "object",
              properties: {
                required: { type: "array", items: { type: "string" } },
                preferred: { type: "array", items: { type: "string" } },
              },
            },
            certifications: {
              type: "object",
              description: "Structured certification requirements used by the ranking engine.",
              properties: {
                required: { type: "array", items: { type: "string" }, description: "Must-have certifications (e.g. ['ISO 9001', 'AQAP 2110'])." },
                preferred: { type: "array", items: { type: "string" }, description: "Nice-to-have certifications." },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            language: {
              type: "object",
              properties: {
                required: { type: "array", items: { type: "string" }, description: "ISO 639-1 codes or language names required for delivery." },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            urgency: {
              type: "object",
              properties: {
                level: { type: "string", enum: ["low", "medium", "high", "critical"] },
                rationale: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            budget: {
              type: "object",
              properties: {
                max_eur: { type: ["integer", "null"] },
                currency_original: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            contract_duration: {
              type: "object",
              properties: {
                duration: { type: "string", description: "Original phrase, kept for display." },
                value: { type: "number", description: "Numeric duration value." },
                unit: { type: "string", enum: ["month", "year"] },
                type: { type: "string", enum: ["minimum", "expected", "maximum", "fixed"] },
              },
            },
            search_context: { type: "string" },
            resilience: {
              type: "object",
              description: "SX-02 — operational posture the interpretation should be evaluated against.",
              properties: {
                posture: {
                  type: "string",
                  enum: ["steady_state", "crisis_response", "wartime_continuity"],
                  description: "Default 'steady_state' if unspecified.",
                },
                scenarios: {
                  type: "array",
                  items: { type: "string" },
                  description: "Named disruption scenarios the user mentioned (e.g. 'GNSS jamming', 'pandemic').",
                },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            value_chain: {
              type: "object",
              description: "SX-02 — value-chain sensitivity. Set sensitive=true when user expresses supply-chain / chokepoint concern. When search_context='supply_chain_analysis' default sensitive=true.",
              properties: {
                sensitive: { type: "boolean" },
                chokepoint_concerns: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["single_source", "foreign_dependency", "transport_chokepoint", "energy", "telecom", "raw_materials"],
                  },
                },
                notes: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
            inference_paths: {
              type: "object",
              description: "Per-axis explanation of why a constraint was inferred. Keys include axis names (capacity, certifications, urgency, sourcing_intent, resilience, value_chain, etc.); values are short rationale strings citing the source phrase.",
              additionalProperties: { type: "string" },
            },
          },
        },
        effect_chains: {
          type: "array",
          description: "SX-02 — OPTIONAL. Emit at most ONE chain ONLY when the need is structurally sequential (sense → decide → act). For flat market-mapping needs, omit or emit empty array.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Optional human label for the chain." },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role_index: { type: "integer", description: "0-based positional index into the roles array." },
                    stage: { type: "string", description: "Short stage label, e.g. 'sense', 'fuse', 'decide', 'act'." },
                    stage_index: { type: "integer", description: "0-based order in the chain." },
                  },
                  required: ["role_index", "stage", "stage_index"],
                },
              },
            },
            required: ["nodes"],
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

    const reqBody = await req.json();
    const need_description = reqBody?.need_description;
    // SX-04 — caller-supplied A1 Axis clarifications: [{question, answer}].
    const axis_clarifications: Array<{ question: string; answer: string }> = Array.isArray(reqBody?.axis_clarifications)
      ? reqBody.axis_clarifications
      : [];
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
            const errMsg = dlError && dlError.message ? dlError.message : "unknown error";
            extractionErrors.push("Failed to download " + att.reference + ": " + errMsg);
            continue;
          }
          // Call extract-file-text edge function (forward caller JWT)
          const formData = new FormData();
          formData.append("file", new File([fileData], att.reference));
          const extractResp = await fetch(`${supabaseUrl}/functions/v1/extract-file-text`, {
            method: "POST",
            headers: { Authorization: authHeader },
            body: formData,
          });
          if (extractResp.ok) {
            const { text } = await extractResp.json();
            if (text) extractedTexts.push(`EXTRACTED FROM: ${att.reference}\n${text}`);
          } else {
            extractionErrors.push(`Failed to extract text from ${att.reference}`);
          }
        } else if (att.type === "url") {
          const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
          if (!internalSecret) {
            extractionErrors.push(`Cannot extract URL ${att.reference}: INTERNAL_FUNCTION_SECRET is not configured on the server.`);
            continue;
          }
          const extractResp = await fetch(`${supabaseUrl}/functions/v1/extract-url-text`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": internalSecret,
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
    // SX-04 — Axis clarifications block. Treated as AUTHORITATIVE user intent.
    if (axis_clarifications.length > 0) {
      const lines = axis_clarifications
        .map((c) => `Q: ${String(c.question || "").trim()}\nA: ${String(c.answer || "").trim()}`)
        .join("\n");
      combinedInput += `\n\nAXIS CLARIFICATIONS (treat as authoritative user intent — use these to disambiguate the need, populate constraints, and shape role scope):\n${lines}`;
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

    const categoryMap = new Map(categories.map((c: any) => [c.id, c]));

    const ontologyText = "\n" + buildOntologyBlock(categories as any, entries as any);

    const proposedNewInstructions = `

When you fill any role's proposed_new[] array, you MUST also include:
- proposed_category_id: the UUID of the sub-category (from the ONTOLOGY block above) the proposal best fits under. Required.
- matched_entry_id (optional): the UUID of an existing entry from the ONTOLOGY block if the proposed name closely matches that entry. Prefer mapping to an existing entry over proposing a new one when the match is strong.`;

    const userMessage = `${combinedInput}\n\n---\n\nONTOLOGY:\n${ontologyText}${proposedNewInstructions}`;
    console.log(`[interpret-need] ontology prompt block chars: ${ontologyText.length}`);

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

    // Attempt 1: tool calling. Retry trigger covers BOTH:
    //   (a) HTTP failure (network/5xx/malformed JSON from gateway), AND
    //   (b) valid 200 response that is empty / has no parseable tool call.
    // 429/402 are surfaced immediately with explicit codes (no retry).
    const aiResponse1 = await callAI(true);
    let attempt1ShouldRetry = false;
    let attempt1Error: string | null = null;

    if (!aiResponse1.ok) {
      const errText = await aiResponse1.text().catch(() => "");
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
      // Other HTTP failure (5xx, network) → trigger retry via JSON mode
      attempt1ShouldRetry = true;
      attempt1Error = `AI gateway error ${aiResponse1.status}`;
    } else {
      const aiResult1 = await aiResponse1.json().catch(() => null);
      const toolCall = aiResult1?.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          parsed = JSON.parse(toolCall.function.arguments);
        } catch (_e) {
          // Malformed tool args → trigger retry
          attempt1ShouldRetry = true;
          attempt1Error = "Tool call arguments unparseable";
        }
      }
      if (!parsed && !attempt1ShouldRetry) {
        attempt1ShouldRetry = true;
      }
    }

    // Attempt 2: JSON mode retry — covers both HTTP-failure and empty-response cases above
    if (!parsed && attempt1ShouldRetry) {
      const aiResponse2 = await callAI(false);
      if (!aiResponse2.ok) {
        const errText = await aiResponse2.text().catch(() => "");
        console.error("AI JSON mode error:", aiResponse2.status, errText);
        if (aiResponse2.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse2.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({
          error: `AI service unavailable (initial: ${attempt1Error || "empty response"}, retry: HTTP ${aiResponse2.status})`,
        }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResult2 = await aiResponse2.json().catch(() => null);
      let content = aiResult2?.choices?.[0]?.message?.content || "";
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      try {
        parsed = JSON.parse(content);
      } catch (_e) {
        console.error("Failed to parse JSON from AI content:", content.slice(0, 500));
        return new Response(JSON.stringify({
          error: "AI returned unparseable response after retry",
        }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step E — Transform response
    const entryMap = new Map(entries.map((e: any) => [e.id, e]));
    const interpretationId = crypto.randomUUID();

    // Build role name->id map for dependencies; also collect ordered ids for index mapping
    const roleNameToId = new Map<string, string>();
    const roleIds: string[] = [];
    for (const r of parsed.roles || []) {
      const rid = crypto.randomUUID();
      roleNameToId.set(r.name, rid);
      roleIds.push(rid);
    }

    // Build summary points (now that roleIds exist, map role indices to IDs)
    const summary = (parsed.summary || []).map((s: any) => ({
      id: crypto.randomUUID(),
      text: s.text,
      source: "axis" as const,
      status: "pending" as const,
      covered_by_roles: Array.isArray(s.covered_by_role_indices)
        ? s.covered_by_role_indices
            .map((i: number) => roleIds[i])
            .filter((id: string | undefined): id is string => !!id)
        : [],
    }));




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
        const proposed_category_id = typeof p.proposed_category_id === "string" && p.proposed_category_id ? p.proposed_category_id : undefined;
        const matched_entry_id = typeof p.matched_entry_id === "string" && p.matched_entry_id ? p.matched_entry_id : undefined;
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
          ...(proposed_category_id ? { proposed_category_id } : {}),
          ...(matched_entry_id ? { matched_entry_id } : {}),
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
        name: r.name,
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

    // SX-02 — build effect chains (map role_index → role_id, same pattern as summary covered_by_role_indices)
    const effectChains = Array.isArray(parsed.effect_chains)
      ? parsed.effect_chains
          .map((c: any) => {
            const nodes = Array.isArray(c?.nodes)
              ? c.nodes
                  .map((n: any) => {
                    const rid = typeof n?.role_index === "number" ? roleIds[n.role_index] : undefined;
                    if (!rid) return null;
                    return {
                      role_id: rid,
                      stage: typeof n.stage === "string" ? n.stage : "",
                      stage_index: typeof n.stage_index === "number" ? n.stage_index : 0,
                    };
                  })
                  .filter((n: any) => n !== null)
              : [];
            if (nodes.length === 0) return null;
            nodes.sort((a: any, b: any) => a.stage_index - b.stage_index);
            return {
              id: crypto.randomUUID(),
              name: typeof c?.name === "string" ? c.name : undefined,
              nodes,
              confidence: ["high", "medium", "low"].includes(c?.confidence) ? c.confidence : undefined,
              source: "axis" as const,
              status: "pending" as const,
            };
          })
          .filter((c: any) => c !== null)
      : [];

    const interpretation: any = {
      id: interpretationId,
      summary,
      roles,
      constraints,
    };
    if (effectChains.length > 0) interpretation.effect_chains = effectChains;

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
