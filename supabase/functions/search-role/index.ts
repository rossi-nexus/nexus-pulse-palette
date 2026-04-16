import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const QUERY_SYNTHESIS_PROMPT = `You are a search query specialist for the defence, security, and critical infrastructure sectors.

Given a role description and its target categories, generate 3-5 web search queries that would find companies or organizations matching this role.

Rules:
- Each query should target a different angle (product-focused, capability-focused, location-focused, etc.)
- Include geographic terms from the constraints if present
- Use industry-specific terminology, not generic terms
- Queries should work well with Google/Bing — natural language, not boolean operators
- If security classification constraints exist, include terms like "defence contractor" or "NATO cleared" where relevant`;

const QUERY_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_queries",
    description: "Submit the generated search queries.",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          description: "3-5 web search queries",
        },
      },
      required: ["queries"],
    },
  },
};

const ACTOR_VALIDATION_PROMPT = `You are an actor (company/organization) identification specialist for the defence, security, and critical infrastructure sectors.

Given a set of web search results and a role description with target categories, identify distinct actors (companies or organizations) that could fulfill this role.

For each actor found:
1. Extract: name, location (city, country), brief description (1-2 sentences), website URL
2. Check if any search results mention security classifications or clearances
3. Check if any search results mention standards/certifications
4. Assess match strength:
   - STRONG: multiple signals across different sources, clearly relevant to the role targets
   - MODERATE: some relevant signals, partially matches targets
   - WEAK: tangential relevance, few matching signals
5. Extract key text snippets that justify the match (2-3 per actor)

Rules:
- ONLY return companies/organizations that appear in the provided search results — NEVER invent, guess, or generate actors from training knowledge
- Every actor you return MUST have at least one source URL from the search results as evidence
- Deduplicate: if the same company appears in multiple results, merge into one actor
- Maximum 20 actors per role
- If a result is a directory or list page, extract individual companies from it
- Ignore job boards, Wikipedia overview pages, and news articles that don't identify specific actors
- If the search results contain few relevant actors, return fewer actors — do not pad the list with invented entries`;

const ACTOR_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_actors",
    description: "Submit the validated actors extracted from search results.",
    parameters: {
      type: "object",
      properties: {
        actors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              location: { type: "string" },
              country: { type: "string" },
              website: { type: "string" },
              description: { type: "string" },
              match_strength: { type: "string", enum: ["strong", "moderate", "weak"] },
              classification_found: { type: "string" },
              standards_found: { type: "array", items: { type: "string" } },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    url: { type: "string" },
                    title: { type: "string" },
                    type: { type: "string", enum: ["company_website", "news", "directory", "government", "linkedin", "other"] },
                    credibility: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["url", "title", "type", "credibility"],
                },
              },
              evidence_snippets: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description", "match_strength", "sources", "evidence_snippets"],
          },
        },
      },
      required: ["actors"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!serperApiKey) {
      return new Response(JSON.stringify({ error: "SERPER_API_KEY not configured. Web search requires a Serper API key." }), {
        status: 503,
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

    const { role, constraints, session_id } = await req.json();
    if (!role) {
      return new Response(JSON.stringify({ error: "Missing role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Step A — Query Synthesis ===
    const selectedTargets: Record<string, string[]> = {};
    for (const [catKey, entries] of Object.entries(role.targets || {})) {
      const selected = (entries as any[]).filter((e: any) => e.selected).map((e: any) => e.entry_name);
      if (selected.length > 0) selectedTargets[catKey] = selected;
    }

    const roleDescription = `Role: ${role.name}
Selected targets:
${Object.entries(selectedTargets).map(([k, v]) => `  ${k}: ${v.join(", ")}`).join("\n")}
${constraints?.geography?.countries ? `Geography: ${constraints.geography.countries.join(", ")}` : ""}
${constraints?.geography?.regions ? `Regions: ${constraints.geography.regions.join(", ")}` : ""}
${constraints?.geography?.cities ? `Cities: ${constraints.geography.cities.join(", ")}` : ""}
${constraints?.security_classification?.required_level ? `Security level: ${constraints.security_classification.required_level}` : ""}
${constraints?.standards?.required ? `Required standards: ${constraints.standards.required.join(", ")}` : ""}`;

    async function callAI(systemPrompt: string, userMessage: string, toolSchema: any, toolName: string, maxTokens: number) {
      const body: any = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
        tools: [toolSchema],
        tool_choice: { type: "function", function: { name: toolName } },
      };

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`AI gateway error ${resp.status}: ${errText}`);
      }

      const result = await resp.json();
      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          return JSON.parse(toolCall.function.arguments);
        } catch {
          // Fall through to JSON mode retry
        }
      }

      // Retry with JSON mode
      const body2: any = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt + "\n\nReturn ONLY valid JSON. No markdown fences." },
          { role: "user", content: userMessage },
        ],
        max_tokens: maxTokens,
      };
      const resp2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body2),
      });
      if (!resp2.ok) throw new Error(`AI JSON mode error ${resp2.status}`);
      const result2 = await resp2.json();
      let content = result2.choices?.[0]?.message?.content || "";
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      return JSON.parse(content);
    }

    // Generate queries
    let queries: string[];
    try {
      const queryResult = await callAI(QUERY_SYNTHESIS_PROMPT, roleDescription, QUERY_TOOL_SCHEMA, "submit_queries", 4096);
      queries = queryResult.queries || [];
      if (queries.length === 0) throw new Error("No queries generated");
    } catch (e) {
      console.error("Query synthesis failed:", e);
      return new Response(JSON.stringify({
        role_id: role.id,
        actors: [],
        queries_used: [],
        search_mode: "web",
        processing_time_ms: Date.now() - startTime,
        error: `Query synthesis failed: ${(e as Error).message}`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Step B — Web Search via Serper ===
    const constraintCountry = constraints?.geography?.countries?.[0]?.toLowerCase() || "no";
    const allResults: any[] = [];
    const seenDomains = new Set<string>();

    for (const query of queries) {
      try {
        const searchResp = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": serperApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: query,
            gl: constraintCountry,
            num: 10,
          }),
        });

        if (!searchResp.ok) {
          console.error(`Serper error for query "${query}":`, searchResp.status);
          continue;
        }

        const searchData = await searchResp.json();
        for (const result of searchData.organic || []) {
          try {
            const domain = new URL(result.link).hostname.replace(/^www\./, "");
            if (!seenDomains.has(domain)) {
              seenDomains.add(domain);
              allResults.push({
                url: result.link,
                title: result.title,
                snippet: result.snippet,
                domain,
              });
            }
          } catch {
            // Skip invalid URLs
          }
        }
      } catch (e) {
        console.error(`Search failed for query "${query}":`, e);
      }
    }

    if (allResults.length === 0) {
      return new Response(JSON.stringify({
        role_id: role.id,
        actors: [],
        queries_used: queries,
        search_mode: "web",
        processing_time_ms: Date.now() - startTime,
        error: "Web search returned no results",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Step C — Actor Extraction & Validation ===
    const searchResultsText = allResults.map((r, i) =>
      `[${i + 1}] "${r.title}" — ${r.url}\n    ${r.snippet || "(no snippet)"}`
    ).join("\n\n");

    const validationMessage = `ROLE: ${roleDescription}

SEARCH RESULTS (${allResults.length} unique results):
${searchResultsText}`;

    let actorsData: any;
    try {
      actorsData = await callAI(ACTOR_VALIDATION_PROMPT, validationMessage, ACTOR_TOOL_SCHEMA, "submit_actors", 8192);
    } catch (e) {
      console.error("Actor validation failed:", e);
      return new Response(JSON.stringify({
        role_id: role.id,
        actors: [],
        queries_used: queries,
        search_mode: "web",
        processing_time_ms: Date.now() - startTime,
        error: `Actor validation failed: ${(e as Error).message}`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actors = (actorsData.actors || []).map((a: any) => ({
      ...a,
      id: crypto.randomUUID(),
    }));

    return new Response(JSON.stringify({
      role_id: role.id,
      actors,
      queries_used: queries,
      search_mode: "web",
      processing_time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("search-role error:", err);
    return new Response(
      JSON.stringify({ error: `Search failed: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
