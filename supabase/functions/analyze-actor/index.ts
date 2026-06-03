import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANALYSIS_PROMPT = `You are a defence & security industry analyst performing a detailed capability assessment of a specific company.

LANGUAGE: All output (descriptions, summaries, evidence, role/title text) MUST be in English. If source material is in another language (e.g. Norwegian, Swedish, Danish, Finnish), translate to clear professional English. Do not echo source-language phrases unless they are proper nouns — company names, product brand names, person names, and place names stay as-is. Translate role/title words (e.g. "Daglig leder"→"CEO", "Operasjonssjef"→"Operations Manager", "Salgssjef"→"Sales Manager", "Styreleder"→"Chairman").

You are given:
1. The company's name, website, and description
2. Web search results about this company (URLs, titles, snippets)
3. A role description with target categories (capabilities, competences, domains, product types, service types)
4. Search constraints (geography, classification requirements, etc.)

Your task: analyze the search results and produce a comprehensive capability profile for this company, specifically assessing how well it matches the given role.

For each of the 5 ontology dimensions, identify ONLY items where you found evidence in the search results:

1. Capabilities — match against the role's target capability categories. For each matched category, list the specific raw entries (sub-items) that have evidence. Every entry MUST have an evidence string explaining what was found.
2. Competences — same structure. Match against target competence categories.
3. Domains — which operational domains does this company serve? Each must have evidence.
4. Products — specific products this company offers that are relevant to the role. Include product name, brief description, and evidence of where you found it. Only list products that appeared in the search results.
5. Services — specific services this company offers that are relevant to the role. Same format as products.

Additionally, extract if found:
- Security classification level (which national systems, what level, evidence source)
- Standards and certifications (ISO, AQAP, STANAG, NS-EN, NATO, etc.). For each, capture: standard_name (the well-known canonical form when you can identify it — e.g. "ISO 9001", "ISO 14001", "NS-EN 1090", "NATO AQAP-2110"; otherwise the name as found), standard_number (the bare number if separable), certifying_body (the issuer/registrar if mentioned, e.g. "DNV", "Kiwa", "Lloyd's Register"), valid_from / valid_to (ISO dates if mentioned, omit otherwise), evidence, source_url.
- Capacity signals: team_size, fleet_size, mobilization_time (e.g. "immediate", "24h", "1 week"), production_capacity, or other quantifiable capacity attributes. Each capacity item must have: attribute_type (one of: team_size | fleet_size | mobilization_time | production_capacity | other_capacity), value_text (human-readable value, always provided), optional value_min and value_max numeric bounds when the source gives a range, optional unit (e.g. "people", "vehicles", "tonnes/year"), evidence, source_url. Only emit capacity items you actually found evidence for.
- Customer references (who they've worked for, in what domain, when)
- Headquarters address (extract from About / Contact / Footer / company info sections). Provide as a structured object with street, postal_code, city, region, country (ISO-2 or full name), required evidence, and source_url. Omit entirely if you cannot find it.

Rules:
- ONLY report what you found in the provided search results. NEVER invent capabilities, products, services, customer references, capacity signals, or certifications.
- Every match MUST have an evidence field explaining what specific text or information supports it.
- If the search results contain limited information, produce a shorter profile. Do not pad with assumptions.
- Match strength is not your concern here — that was assessed in Step 3. Your job is to provide detailed evidence of what this company can do.
- Use the ontology entry IDs from the role targets when matching. If a capability matches a target entry, use that entry's ID. If you find something not in the targets, describe it but mark it as "additional" (no ontology ID).
- For classification: be specific about which country's system (NO, SE, NATO, etc.) and the national term (HEMMELIG, HEMLIG, etc.). Only report what you found evidence for.
- For customer references: include the customer segment (defense, civil_government, commercial, export) where identifiable.
- All enum values MUST be lowercase: confidence ("high"|"medium"|"low"), classification level ("top_secret"|"secret"|"confidential"|"restricted"|"industrial_security"|"unclassified"|"unknown"), customer segment ("defense"|"civil_government"|"commercial"|"export"), source type ("company_website"|"news"|"directory"|"government"|"linkedin"|"annual_report"|"other"), capacity attribute_type ("team_size"|"fleet_size"|"mobilization_time"|"production_capacity"|"other_capacity").`;

const ANALYSIS_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_analysis",
    description: "Submit the deep capability analysis for this actor.",
    parameters: {
      type: "object",
      properties: {
        capabilities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              categoryId: { type: "string" },
              categoryName: { type: "string" },
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entryId: { type: "string" },
                    entryName: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["entryName", "evidence"],
                },
              },
            },
            required: ["categoryName", "entries"],
          },
        },
        competences: {
          type: "array",
          items: {
            type: "object",
            properties: {
              categoryId: { type: "string" },
              categoryName: { type: "string" },
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entryId: { type: "string" },
                    entryName: { type: "string" },
                    evidence: { type: "string" },
                  },
                  required: ["entryName", "evidence"],
                },
              },
            },
            required: ["categoryName", "entries"],
          },
        },
        domains: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entryId: { type: "string" },
              domainName: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["domainName", "evidence"],
          },
        },
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entryId: { type: "string" },
              productName: { type: "string" },
              description: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["productName", "evidence"],
          },
        },
        services: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entryId: { type: "string" },
              serviceName: { type: "string" },
              description: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["serviceName", "evidence"],
          },
        },
        classification: {
          type: "object",
          properties: {
            levelNormalized: {
              type: "string",
              enum: ["top_secret", "secret", "confidential", "restricted", "industrial_security", "unclassified", "unknown"],
            },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  system: { type: "string" },
                  levelNationalTerm: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  evidence: { type: "string" },
                },
                required: ["system", "confidence", "evidence"],
              },
            },
          },
        },
        standards: {
          type: "array",
          description: "Standards / certifications evidenced for this actor.",
          items: {
            type: "object",
            properties: {
              standardName: { type: "string", description: "Canonical form when identifiable (e.g. 'ISO 9001', 'NATO AQAP-2110'); otherwise as-found." },
              standardNumber: { type: "string" },
              certifyingBody: { type: "string", description: "Issuer / registrar if mentioned, e.g. 'DNV', 'Kiwa'." },
              validFrom: { type: "string", description: "ISO date YYYY-MM-DD if mentioned." },
              validTo: { type: "string", description: "ISO date YYYY-MM-DD if mentioned." },
              evidence: { type: "string" },
              sourceUrl: { type: "string" },
            },
            required: ["standardName", "evidence"],
          },
        },
        capacity: {
          type: "array",
          description: "Capacity signals (team size, fleet, mobilization, production capacity) evidenced for this actor.",
          items: {
            type: "object",
            properties: {
              attributeType: {
                type: "string",
                enum: ["team_size", "fleet_size", "mobilization_time", "production_capacity", "other_capacity"],
              },
              valueText: { type: "string", description: "Human-readable value, always provided (e.g. '120 employees', '24h', '8000 tonnes/year')." },
              valueMin: { type: "number" },
              valueMax: { type: "number" },
              unit: { type: "string" },
              evidence: { type: "string" },
              sourceUrl: { type: "string" },
            },
            required: ["attributeType", "valueText", "evidence"],
          },
        },
        customerHistory: {
          type: "array",
          items: {
            type: "object",
            properties: {
              customerName: { type: "string" },
              description: { type: "string" },
              year: { type: "number" },
              domain: { type: "string" },
              segment: {
                type: "string",
                enum: ["defense", "civil_government", "commercial", "export"],
              },
              evidence: { type: "string" },
            },
            required: ["customerName", "evidence"],
          },
        },
        analysisSources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              title: { type: "string" },
              type: {
                type: "string",
                enum: ["company_website", "news", "directory", "government", "linkedin", "annual_report", "other"],
              },
            },
            required: ["url", "title", "type"],
          },
        },
        headquarters_address: {
          type: "object",
          description: "Company headquarters address extracted from About/Contact/Footer/company-info content. Omit if not present in sources.",
          properties: {
            street: { type: "string" },
            postal_code: { type: "string" },
            city: { type: "string" },
            region: { type: "string" },
            country: { type: "string" },
            evidence: { type: "string" },
            source_url: { type: "string" },
          },
          required: ["evidence"],
        },
      },
      required: ["capabilities", "competences", "domains", "products", "services", "analysisSources"],
    },
  },
};

interface SearchSourceIn {
  url: string;
  title: string;
}

interface ActorIn {
  id: string;
  name: string;
  website?: string;
  description: string;
  actor_type: string;
  sources: SearchSourceIn[];
  evidence_snippets: string[];
}

interface RoleTargetsIn {
  capabilities: { entryId: string; rawName: string }[];
  competences: { entryId: string; rawName: string }[];
  domains: { entryId: string; rawName: string }[];
  productTypes: { entryId: string; rawName: string }[];
  serviceTypes: { entryId: string; rawName: string }[];
}

interface RoleIn {
  id: string;
  name: string;
  targets: RoleTargetsIn;
}

function safeUrl(u?: string): URL | null {
  if (!u) return null;
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw: any): any {
  // Lowercase enums regardless of what model returned
  const lc = (v: any) => (typeof v === "string" ? v.toLowerCase() : v);

  const a = { ...raw };
  a.capabilities = Array.isArray(raw?.capabilities) ? raw.capabilities : [];
  a.competences = Array.isArray(raw?.competences) ? raw.competences : [];
  a.domains = Array.isArray(raw?.domains) ? raw.domains : [];
  a.products = Array.isArray(raw?.products) ? raw.products : [];
  a.services = Array.isArray(raw?.services) ? raw.services : [];
  a.standards = Array.isArray(raw?.standards) ? raw.standards : [];
  a.capacity = Array.isArray(raw?.capacity) ? raw.capacity : [];
  a.customerHistory = Array.isArray(raw?.customerHistory) ? raw.customerHistory : [];
  a.analysisSources = Array.isArray(raw?.analysisSources) ? raw.analysisSources : [];

  if (raw?.classification && typeof raw.classification === "object") {
    a.classification = {
      levelNormalized: lc(raw.classification.levelNormalized) || "unknown",
      details: Array.isArray(raw.classification.details)
        ? raw.classification.details.map((d: any) => ({
            ...d,
            confidence: lc(d.confidence) || "low",
          }))
        : [],
    };
  }

  a.customerHistory = a.customerHistory.map((c: any) => ({
    ...c,
    segment: c.segment ? lc(c.segment) : undefined,
  }));

  a.analysisSources = a.analysisSources.map((s: any) => ({
    ...s,
    type: lc(s.type) || "other",
  }));

  // Drop entries without evidence — contract requires it
  for (const grp of ["capabilities", "competences"] as const) {
    a[grp] = a[grp]
      .map((cat: any) => ({
        ...cat,
        entries: Array.isArray(cat.entries)
          ? cat.entries.filter((e: any) => e?.evidence && e?.entryName)
          : [],
      }))
      .filter((cat: any) => cat.entries.length > 0);
  }
  a.domains = a.domains.filter((d: any) => d?.evidence && d?.domainName);
  a.products = a.products.filter((p: any) => p?.evidence && p?.productName);
  a.services = a.services.filter((s: any) => s?.evidence && s?.serviceName);
  a.standards = a.standards.filter((s: any) => s?.evidence && s?.standardName);
  a.capacity = a.capacity.filter((c: any) => c?.evidence && c?.attributeType && c?.valueText);
  a.customerHistory = a.customerHistory.filter((c: any) => c?.evidence && c?.customerName);

  // headquarters_address: pass through only if it has at least one address field + evidence
  if (raw?.headquarters_address && typeof raw.headquarters_address === "object") {
    const h = raw.headquarters_address;
    const hasAnyField = h.street || h.postal_code || h.city || h.region || h.country;
    if (hasAnyField && h.evidence) {
      a.headquarters_address = {
        street: h.street || null,
        postal_code: h.postal_code || null,
        city: h.city || null,
        region: h.region || null,
        country: h.country || null,
        evidence: h.evidence,
        source_url: h.source_url || null,
      };
    }
  }

  return a;
}

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
      return new Response(
        JSON.stringify({ error: "SERPER_API_KEY not configured. Deep analysis requires a Serper API key." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const body = await req.json();
    const actor = body.actor as ActorIn;
    const role = body.role as RoleIn;
    const constraints = body.constraints || {};
    // AX2: optional persistence target — when provided AND it matches a row in
    // public.actors, extracted capacity + standards are written via the
    // SECURITY DEFINER fn_persist_actor_enrichment RPC (idempotent).
    const persistToActorId: string | null = typeof body.persist_to_actor_id === "string"
      ? body.persist_to_actor_id
      : null;

    if (!actor || !actor.name) {
      return new Response(JSON.stringify({ error: "Missing actor" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!role || !role.name) {
      return new Response(JSON.stringify({ error: "Missing role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Step A — Source Gathering via Serper ===
    const constraintCountry = constraints?.geography?.countries?.[0]?.toLowerCase() || "no";
    const websiteHost = safeUrl(actor.website)?.hostname.replace(/^www\./, "");

    const queries: string[] = [];
    if (websiteHost) {
      queries.push(`site:${websiteHost} ${role.name}`);
    }
    const topCaps = (role.targets.capabilities || []).slice(0, 3).map((c) => c.rawName).filter(Boolean);
    if (topCaps.length > 0) {
      queries.push(`"${actor.name}" ${topCaps.join(" ")}`);
    }
    queries.push(`"${actor.name}" defence security contract`);

    const gatheredResults: { url: string; title: string; snippet: string }[] = [];
    const seenUrls = new Set<string>();

    // Seed with sources from Step 3
    for (const s of actor.sources || []) {
      if (s.url && !seenUrls.has(s.url)) {
        seenUrls.add(s.url);
        gatheredResults.push({ url: s.url, title: s.title || s.url, snippet: "" });
      }
    }

    let serperFailed = false;
    let serperRateLimited = false;
    let serperHardFailures = 0;
    const serperAttempted = queries.length;
    for (const q of queries) {
      try {
        const resp = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q, gl: constraintCountry, num: 8 }),
        });
        if (resp.status === 429) {
          serperRateLimited = true;
          serperFailed = true;
          await resp.text().catch(() => "");
          console.warn(`Serper rate limit (429) for "${q}"`);
          continue;
        }
        if (!resp.ok) {
          serperHardFailures += 1;
          serperFailed = true;
          await resp.text().catch(() => "");
          console.warn(`Serper failed for "${q}": ${resp.status}`);
          continue;
        }
        const data = await resp.json();
        for (const r of data.organic || []) {
          if (r.link && !seenUrls.has(r.link)) {
            seenUrls.add(r.link);
            gatheredResults.push({
              url: r.link,
              title: r.title || r.link,
              snippet: r.snippet || "",
            });
          }
        }
      } catch (e) {
        serperHardFailures += 1;
        serperFailed = true;
        console.warn(`Serper error for "${q}":`, e);
      }
    }

    // If Step-3 sources also produced nothing (gatheredResults seeded from
    // actor.sources first; an empty pool means we have neither prior sources
    // nor any new Serper hits), the only honest move is to surface upstream
    // failure rather than hand the AI an empty workload (P24).
    if (gatheredResults.length === 0) {
      const allQueriesFailed = serperAttempted > 0 &&
        (serperRateLimited || serperHardFailures >= serperAttempted);
      if (allQueriesFailed && serperRateLimited) {
        return new Response(JSON.stringify({
          error: "Web search rate limit reached. Try again in a moment.",
          actor_id: actor.id,
          role_id: role.id,
          processing_time_ms: Date.now() - startTime,
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (allQueriesFailed) {
        return new Response(JSON.stringify({
          error: `Web search upstream failed (${serperHardFailures}/${serperAttempted} queries errored)`,
          actor_id: actor.id,
          role_id: role.id,
          processing_time_ms: Date.now() - startTime,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Genuine zero-source state (no Step-3 sources AND no queries OR queries
      // succeeded but found nothing). Keep the existing 200 shape so the caller
      // treats it as "nothing to analyze" rather than an error.
      return new Response(JSON.stringify({
        actor_id: actor.id,
        role_id: role.id,
        analysis: null,
        processing_time_ms: Date.now() - startTime,
        error: "No source data available for analysis (no Step 3 sources, no Serper results).",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === Step B — Deep Analysis ===
    const targetText = (label: string, items: { entryId: string; rawName: string }[]) => {
      if (!items || items.length === 0) return `${label}: (none)`;
      return `${label}:\n${items.map((i) => `  - [${i.entryId}] ${i.rawName}`).join("\n")}`;
    };

    const userMessage = `COMPANY: ${actor.name}
WEBSITE: ${actor.website || "(unknown)"}
ACTOR TYPE: ${actor.actor_type}
DESCRIPTION FROM STEP 3: ${actor.description}

ROLE: ${role.name} (id: ${role.id})

ROLE TARGETS (use these entryIds when matching):
${targetText("Capabilities", role.targets.capabilities)}
${targetText("Competences", role.targets.competences)}
${targetText("Domains", role.targets.domains)}
${targetText("Product types", role.targets.productTypes)}
${targetText("Service types", role.targets.serviceTypes)}

CONSTRAINTS:
${constraints?.geography?.countries ? `Geography: ${constraints.geography.countries.join(", ")}` : ""}
${constraints?.security_classification?.required_level ? `Security level required: ${constraints.security_classification.required_level}` : ""}
${constraints?.standards?.required ? `Required standards: ${constraints.standards.required.join(", ")}` : ""}

EVIDENCE SNIPPETS FROM STEP 3:
${(actor.evidence_snippets || []).map((s, i) => `[s${i + 1}] ${s}`).join("\n") || "(none)"}

WEB SEARCH RESULTS (${gatheredResults.length}):
${gatheredResults.map((r, i) => `[${i + 1}] "${r.title}" — ${r.url}\n    ${r.snippet || "(no snippet)"}`).join("\n\n")}`;

    async function callAI(): Promise<{ data: any; mode: "tool" | "json" }> {
      // Attempt 1: tool calling
      const body1 = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 8192,
        tools: [ANALYSIS_TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "submit_analysis" } },
      };
      const resp1 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body1),
      });
      if (resp1.status === 429) throw new Error("Rate limited (429). Please retry shortly.");
      if (resp1.status === 402) throw new Error("Lovable AI credits exhausted (402).");
      if (resp1.ok) {
        const r1 = await resp1.json();
        const args = r1.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args) {
          try {
            return { data: JSON.parse(args), mode: "tool" };
          } catch {
            // fall through
          }
        }
      } else {
        console.warn("Tool-call attempt failed:", resp1.status, await resp1.text().catch(() => ""));
      }

      // Attempt 2: JSON fallback
      const body2 = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: ANALYSIS_PROMPT + "\n\nReturn ONLY valid JSON matching the submit_analysis schema. No markdown fences." },
          { role: "user", content: userMessage },
        ],
        max_tokens: 8192,
      };
      const resp2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body2),
      });
      if (resp2.status === 429) throw new Error("Rate limited (429). Please retry shortly.");
      if (resp2.status === 402) throw new Error("Lovable AI credits exhausted (402).");
      if (!resp2.ok) throw new Error(`AI JSON fallback failed: ${resp2.status}`);
      const r2 = await resp2.json();
      let content = r2.choices?.[0]?.message?.content || "";
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      return { data: JSON.parse(content), mode: "json" };
    }

    let analysisRaw: any;
    let mode: "tool" | "json";
    try {
      const r = await callAI();
      analysisRaw = r.data;
      mode = r.mode;
    } catch (e) {
      console.error("AI analysis failed:", e);
      const msg = (e as Error).message || "Unknown AI failure";
      // Surface explicit upstream codes; otherwise treat as gateway failure (502)
      // so supabase.functions.invoke / fetch !ok branches catch it (P23).
      let status = 502;
      if (/429/.test(msg)) status = 429;
      else if (/402/.test(msg)) status = 402;
      return new Response(JSON.stringify({
        error: `AI analysis failed: ${msg}`,
        actor_id: actor.id,
        role_id: role.id,
        processing_time_ms: Date.now() - startTime,
      }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const analysis = normalizeAnalysis(analysisRaw);

    // AX2 persistence — write capacity + standards to satellite tables when
    // a target verified-actor id is provided. Service-role required because
    // those tables are admin-write via RLS; fn_persist_actor_enrichment is
    // SECURITY DEFINER and accepts service-role callers (auth.uid() NULL).
    let persistResult: { capacity_inserted: number; standards_inserted: number } | null = null;
    let persistError: string | null = null;
    if (persistToActorId && (analysis.capacity?.length || analysis.standards?.length)) {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) {
        persistError = "SUPABASE_SERVICE_ROLE_KEY not configured — persistence skipped.";
        console.warn(persistError);
      } else {
        try {
          const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
          const capacityRows = (analysis.capacity ?? []).map((c: any) => ({
            attribute_type: c.attributeType,
            value_text: c.valueText,
            value_min: typeof c.valueMin === "number" ? c.valueMin : null,
            value_max: typeof c.valueMax === "number" ? c.valueMax : null,
            unit: c.unit ?? null,
            evidence: c.evidence ?? null,
            source_url: c.sourceUrl ?? null,
          }));
          const standardRows = (analysis.standards ?? []).map((s: any) => ({
            standard_name: s.standardName,
            standard_number: s.standardNumber ?? null,
            certifying_body: s.certifyingBody ?? null,
            valid_from: s.validFrom ?? null,
            valid_to: s.validTo ?? null,
            evidence: s.evidence ?? null,
            source_url: s.sourceUrl ?? null,
          }));
          const { data: persistData, error: persistErr } = await supabaseAdmin.rpc(
            "fn_persist_actor_enrichment",
            {
              p_actor_id: persistToActorId,
              p_capacity: capacityRows,
              p_standards: standardRows,
              p_source_url: actor.website ?? null,
            },
          );
          if (persistErr) {
            persistError = persistErr.message ?? String(persistErr);
            console.error("fn_persist_actor_enrichment failed:", persistErr);
          } else {
            const row = Array.isArray(persistData) ? persistData[0] : persistData;
            persistResult = {
              capacity_inserted: Number(row?.capacity_inserted ?? 0),
              standards_inserted: Number(row?.standards_inserted ?? 0),
            };
          }
        } catch (e) {
          persistError = (e as Error).message ?? "unknown persist error";
          console.error("Persist call threw:", e);
        }
      }
    }

    return new Response(JSON.stringify({
      actor_id: actor.id,
      role_id: role.id,
      analysis,
      processing_time_ms: Date.now() - startTime,
      sources_gathered: gatheredResults.length,
      serper_partial_failure: serperFailed,
      analysis_mode: mode,
      persist_result: persistResult,
      persist_error: persistError,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-actor error:", e);
    return new Response(JSON.stringify({
      error: (e as Error).message || "Unknown error",
      processing_time_ms: Date.now() - startTime,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
