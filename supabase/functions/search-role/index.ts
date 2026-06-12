import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const QUERY_SYNTHESIS_PROMPT = `You are a search query specialist for the defence, security, and critical infrastructure sectors.

Given a role description and its target categories, generate 3-5 web search queries that would find companies or organizations matching this role.

Baseline rules:
- Include geographic terms from the constraints if present
- Use industry-specific terminology, not generic terms
- Queries should work well with Google/Bing — natural language, not boolean operators
- If security classification constraints exist, include terms like "defence contractor" or "NATO cleared" where relevant

Query diversity rules:
- Generate queries that approach the role from DIFFERENT angles. At least one query should target manufacturers or product companies, one should target service providers or operators, and one should target integrators or specialists. Do not generate queries that all use the same angle or sentence structure.
- Draw search terms from ALL of the role's target categories: capabilities, competences, domains, product types, AND service types. For example, combine a product type with a geographic constraint ("thermal camera Arctic surveillance Norway"), or a service type with a domain ("systems integration managed services Nordic defence"). Do not rely only on broad capability terms — use specific product names, service descriptions, and competence areas from the role's targets.
- Include at least one query specifically targeting smaller or specialist companies in the constraint countries. For example: "Norwegian specialist [product type] manufacturer" or "[service type] company Finland defence" or "niche [domain] provider Sweden." This is critical — broad sector queries tend to surface only the largest primes and miss important niche players.
- Include one query targeting recent developments, partnerships, joint ventures, or acquisitions in the relevant sector and geography. For example: "Nordic defence [domain] partnership 2025" or "Norway [capability area] joint venture recent." This helps find newly formed entities and changing market structures.
- When the need involves comprehensive or multi-domain coverage (e.g., land, sea, and air), explicitly consider ALL operational domains including space and satellite-based systems as a query angle. For example: "satellite surveillance [country] defence" or "space-based [domain] Nordic."
- Never include specific company names in search queries. Always search by what is needed — using the role's target categories (capabilities, competences, domains, product types, service types) combined with geographic and sector constraints. The goal is to DISCOVER unknown actors, not to confirm actors you already know about.

IMPORTANT — Geographic context vs. company location:
When the role description, reasoning, or need mentions specific locations (cities, islands, regions, coastlines, fjords, municipalities), treat these as OPERATIONAL CONTEXT — where the work will be performed. Do NOT narrow your search queries to companies located in those specific places. Instead, search broadly within the countries listed in the Geography constraint for companies that have the capabilities to serve that operational area.

For example: "surveillance on Askøy island" should search for Norwegian/Nordic surveillance companies, NOT "Askøy surveillance companies."
For example: "Finnmark coastline" should search for Norwegian/Nordic coastal surveillance providers, NOT "Finnmark companies."

The Geography constraint (countries) controls WHERE to look for companies. Specific place names from the role context describe WHERE the work happens — they should inform domain/operational language (e.g., "Arctic", "coastal", "remote") but never become the company-location filter in your search query.`;

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

LANGUAGE: All output text (actor descriptions, evidence) MUST be in English. Translate any Norwegian/Swedish/Danish/Finnish source content into clear professional English. Company names and place names stay as-is.

Given a set of web search results and a role description with target categories, identify distinct actors (companies or organizations) that could fulfill this role.

For each actor found:
1. Extract: name, location (city, country). The country field MUST be the ISO 3166-1 alpha-2 code (e.g. "NO" for Norway, "SE" for Sweden, "FI" for Finland, "DK" for Denmark, "DE" for Germany, "GB" for United Kingdom, "US" for United States). Never use full country names. If country cannot be determined, omit the field. Also provide brief description (1-2 sentences) and website URL.
2. Check if any search results mention security classifications or clearances
3. Check if any search results mention standards/certifications
4. Assess match strength (use lowercase values: "strong", "moderate", "weak"):
   - strong: multiple signals across different sources, clearly relevant to the role targets
   - moderate: some relevant signals, partially matches targets
   - weak: tangential relevance, few matching signals
5. Extract key text snippets that justify the match (2-3 per actor)

Rules:
- ONLY return companies/organizations that appear in the provided search results — NEVER invent, guess, or generate actors from training knowledge
- Every actor you return MUST have at least one source URL from the search results as evidence
- Deduplicate: if the same company appears in multiple results, merge into one actor
- Maximum 20 actors per role
- If a result is a directory or list page, extract individual companies from it
- Ignore job boards, Wikipedia overview pages, and news articles that don't identify specific actors
- If the search results contain few relevant actors, return fewer actors — do not pad the list with invented entries

Actor filtering rules:
- Only return companies or organizations. Exclude individual persons, consultants listed by personal name, freelancers, or sole proprietorships identified only by a person's name. If a search result is about a person rather than a company, skip it entirely.
- Do NOT filter out government agencies, ministries, military units, government research institutes, procurement authorities, universities, or industry bodies. Include them and tag them with the correct actor_type below. The consuming system handles visibility — your job is to identify and tag, not to filter by type.

Actor type tagging:
- Tag each actor with an actor_type field using one of these lowercase values:
  - "commercial" — companies that can be contracted as suppliers or partners (this includes state-owned companies that operate commercially, e.g., Patria)
  - "government" — government agencies, ministries, military units, government R&D institutes (e.g., FFI, FOI), procurement authorities (e.g., FMV, FMA)
  - "academic" — universities, research institutions
  - "industry_body" — NATO agencies, standardization bodies, industry associations
- Return ALL actors you find, regardless of type. Do not drop any actor based on actor_type.

Match strength calibration:
- When assessing match strength, consider the actor's known role in the sector, not just what appeared in one particular search result.
- An actor that is a recognized major provider in the relevant domain should be rated "strong" for that domain, even if the specific search result that surfaced them was about a single contract or news article rather than a general capability overview. For example: Kongsberg Defence & Aerospace for C2 systems in Norway = strong (they are Norway's primary C2 provider), not weak just because only one contract was found in the search results.
- An actor found only in a directory listing, a tangential mention, or a single weak reference should be rated "weak".
- "moderate" is for actors with clear relevance but limited evidence in the search results — real companies in the right sector but not dominant players, or companies where the search results show partial overlap with the role's targets.`;

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
              actor_type: { type: "string", enum: ["commercial", "government", "academic", "industry_body"] },
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
              ontology_signals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ontology_entry_id: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["ontology_entry_id", "confidence"],
                },
              },
            },
            required: ["name", "description", "actor_type", "match_strength", "sources", "evidence_snippets"],
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

    const { role, constraints } = await req.json();
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

    // SX-04 — sourcing intent flavour injection.
    const sourcingIntent: string | undefined = constraints?.geography?.sourcing_intent;
    const resiliencePosture: string | undefined = constraints?.resilience?.posture;
    const intentFlavour =
      sourcingIntent === "national" ? "Norwegian / domestic"
      : sourcingIntent === "regional" ? "Nordic / Baltic"
      : sourcingIntent === "allied" ? "NATO / EU / Five Eyes"
      : null;
    const postureHint =
      resiliencePosture === "wartime_continuity" ? " Emphasize sovereign / wartime-continuity capable suppliers."
      : resiliencePosture === "crisis_response" ? " Emphasize crisis-response capable suppliers."
      : "";

    const roleDescription = `Role: ${role.name}
${role.description ? `Description: ${role.description}\n` : ''}${role.reasoning ? `Reasoning: ${role.reasoning}\n` : ''}Selected targets:
${Object.entries(selectedTargets).map(([k, v]) => `  ${k}: ${v.join(", ")}`).join("\n")}
${constraints?.geography?.countries ? `Geography: ${constraints.geography.countries.join(", ")}` : ""}
${constraints?.geography?.regions ? `Regions: ${constraints.geography.regions.join(", ")}` : ""}
${constraints?.geography?.cities ? `Cities: ${constraints.geography.cities.join(", ")}` : ""}
${intentFlavour ? `Sourcing intent: ${sourcingIntent} — include flavour terms like "${intentFlavour}" in at least one query angle.${postureHint}` : ""}
${constraints?.security_classification?.required_level ? `Security level: ${constraints.security_classification.required_level}` : ""}
${constraints?.standards?.required ? `Required standards: ${constraints.standards.required.join(", ")}` : ""}
${(() => {
  const cd = constraints?.contract_duration;
  if (!cd) return "";
  if (cd.value && cd.unit) {
    const typeLabel = cd.type === "minimum" ? "≥" : cd.type === "maximum" ? "≤" : cd.type === "fixed" ? "= " : "~";
    // Hint the model to bias toward long-term framework agreements when appropriate.
    const phraseHint = (cd.unit === "year" && cd.value >= 2) || (cd.unit === "month" && cd.value >= 18)
      ? ' (consider search modifiers like "framework agreement", "long-term contract", "multi-year")'
      : "";
    return `Contract duration: ${typeLabel}${cd.value} ${cd.unit}(s)${phraseHint}`;
  }
  return cd.duration ? `Contract duration: ${cd.duration}` : "";
})()}`;

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

    // Generate queries — AI failure → 502 (caller can show real error)
    let queries: string[];
    try {
      const queryResult = await callAI(QUERY_SYNTHESIS_PROMPT, roleDescription, QUERY_TOOL_SCHEMA, "submit_queries", 4096);
      queries = queryResult.queries || [];
      if (queries.length === 0) throw new Error("No queries generated");
    } catch (e) {
      console.error("Query synthesis failed:", e);
      return new Response(JSON.stringify({
        error: `Query synthesis failed: ${(e as Error).message}`,
        role_id: role.id,
        processing_time_ms: Date.now() - startTime,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Step B — Web Search via Serper ===
    // AX pre-AX2 Fix 3 — multi-country handling (Option A: iterate per country,
    // dedupe + merge). Chosen over Option B (concatenated `location` string)
    // because the security/defence/preparedness sector treats per-country
    // markets as genuinely distinct (regulation, language, classification,
    // suppliers). Per-country gl= queries return materially different result
    // sets that a single concatenated location call would lose. Trade-off:
    // N× Serper calls per query. We accept that cost for precision; rate-limit
    // accounting is already per-call below.
    const rawCountries = (constraints?.geography?.countries ?? [])
      .map((c: string) => (c ?? "").toLowerCase().trim())
      .filter(Boolean);
    const constraintCountries: string[] = rawCountries.length > 0 ? rawCountries : ["no"];
    const allResults: any[] = [];
    const seenDomains = new Set<string>();
    let serperRateLimited = false;       // any 429
    let serperHardFailures = 0;          // 5xx or network error
    const serperAttempted = queries.length * constraintCountries.length;

    for (const query of queries) {
      for (const gl of constraintCountries) {
        try {
          const searchResp = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": serperApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: query,
              gl,
              num: 10,
            }),
          });

          if (searchResp.status === 429) {
            serperRateLimited = true;
            await searchResp.text().catch(() => "");
            console.error(`Serper rate limit (429) for query "${query}" gl="${gl}"`);
            continue;
          }
          if (!searchResp.ok) {
            serperHardFailures += 1;
            await searchResp.text().catch(() => "");
            console.error(`Serper error for query "${query}" gl="${gl}":`, searchResp.status);
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
                  source_country: gl,
                });
              }
            } catch {
              // Skip invalid URLs
            }
          }
        } catch (e) {
          serperHardFailures += 1;
          console.error(`Search failed for query "${query}" gl="${gl}":`, e);
        }
      }
    }


    // If we got nothing AND every Serper query failed upstream, propagate the
    // failure instead of silently returning "0 actors" (P24).
    if (allResults.length === 0) {
      const allFailed = serperRateLimited || serperHardFailures >= serperAttempted;
      if (allFailed && serperRateLimited) {
        return new Response(JSON.stringify({
          error: "Web search rate limit reached. Try again in a moment.",
          role_id: role.id,
          processing_time_ms: Date.now() - startTime,
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (allFailed) {
        return new Response(JSON.stringify({
          error: `Web search upstream failed (${serperHardFailures}/${serperAttempted} queries errored)`,
          role_id: role.id,
          processing_time_ms: Date.now() - startTime,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Genuine empty result set (Serper succeeded but found nothing) — keep
      // the existing 200 shape so the caller treats it as a normal empty role.
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
        error: `Actor validation failed: ${(e as Error).message}`,
        role_id: role.id,
        queries_used: queries,
        search_mode: "web",
        processing_time_ms: Date.now() - startTime,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawActors = (actorsData.actors || []) as any[];
    const droppedNoSources: string[] = [];
    const actors = rawActors
      .map((a: any) => {
        const ms = typeof a.match_strength === "string" ? a.match_strength.toLowerCase() : a.match_strength;
        const at = typeof a.actor_type === "string" ? a.actor_type.toLowerCase() : a.actor_type;
        return {
          ...a,
          match_strength: ms,
          actor_type: at,
          sources: Array.isArray(a.sources) ? a.sources : [],
          id: crypto.randomUUID(),
        };
      })
      .filter((a: any) => {
        if (a.sources.length === 0) {
          droppedNoSources.push(a.name);
          return false;
        }
        return true;
      });

    if (droppedNoSources.length > 0) {
      console.warn(`Dropped ${droppedNoSources.length} actor(s) without sources:`, droppedNoSources);
    }

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
