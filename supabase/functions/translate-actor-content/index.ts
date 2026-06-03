// V3 batch #4 — Translate persisted actor content (Norwegian and other non-English) to English.
// Admin-only. Iterates user_personal_actors.analysis_data, actor_ontology_tags.evidence,
// and actor_contacts.title. Idempotent: skips rows that no longer match the Norwegian heuristic.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Heuristic: matches obvious Norwegian (also catches Danish/Swedish in many cases).
// Triggers if the text contains common Norwegian-only function words, role nouns,
// or Norwegian-specific letters (æ ø å) outside of clearly-name positions.
const NO_RE =
  /[æøåÆØÅ]|\b(og|er|som|ikke|innen|innenfor|vår|våre|leverandør|spesial|spesialkompetanse|tilbyr|tjenester|løsninger|bekledning|feltutstyr|daglig leder|operasjonssjef|salgssjef|styreleder|markedssjef|prosjektleder|deres|denne|dette|gjennom|kunder|utvikler|leverer|virksomhet|selskap|firma)\b/i;

function looksNorwegian(s: unknown): boolean {
  return typeof s === "string" && s.length > 0 && NO_RE.test(s);
}

async function translate(text: string, lovableApiKey: string): Promise<string> {
  const body = {
    model: "google/gemini-2.5-flash-lite",
    messages: [
      {
        role: "system",
        content:
          "You translate text to clear, professional English. Preserve proper nouns exactly: company names, product brand names, person names, place names. Translate Norwegian/Swedish/Danish role/title words to English equivalents (e.g. 'Daglig leder'→'CEO', 'Operasjonssjef'→'Operations Manager', 'Salgssjef'→'Sales Manager', 'Styreleder'→'Chairman'). If the text is already in clear English, return it unchanged. Return ONLY the translated text — no prefacing, no quotes, no notes.",
      },
      { role: "user", content: text },
    ],
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
    throw new Error(`AI gateway ${resp.status}: ${await resp.text()}`);
  }
  const json = await resp.json();
  const out = json.choices?.[0]?.message?.content;
  if (typeof out !== "string" || !out.trim()) {
    throw new Error("Empty translation response");
  }
  return out.trim();
}

// Recursively walk a JSON value, translating any string field that looks Norwegian
// and is in a known "content" key. We don't translate keys, ids, urls, or short codes.
const CONTENT_KEYS = new Set([
  "description",
  "evidence",
  "summary",
  "notes",
  "title",
  "branch_detail",
  "productName",
  "serviceName",
  "name",
  "scope",
  "level_national_term",
]);
const SKIP_KEYS = new Set([
  "entryId",
  "id",
  "url",
  "source",
  "source_url",
  "actor_name",
  "country",
  "city",
  "region",
  "linkedin",
  "phone",
  "email",
  "org_number",
]);

async function translateJsonInPlace(
  value: unknown,
  apiKey: string,
  counter: { changed: number },
  parentKey: string | null = null,
): Promise<unknown> {
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await translateJsonInPlace(v, apiKey, counter, parentKey));
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await translateJsonInPlace(v, apiKey, counter, k);
    }
    return out;
  }
  if (typeof value === "string") {
    if (parentKey && SKIP_KEYS.has(parentKey)) return value;
    // For productName / name / title: only translate when clearly Norwegian phrasing,
    // not single-word brand names. Heuristic above already requires Norwegian markers.
    if (looksNorwegian(value)) {
      try {
        const translated = await translate(value, apiKey);
        if (translated && translated !== value) counter.changed += 1;
        return translated;
      } catch (_e) {
        return value;
      }
    }
  }
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
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

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdminRow } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!isAdminRow || isAdminRow.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const counts = {
      personal_actors_scanned: 0,
      personal_actors_updated: 0,
      personal_fields_translated: 0,
      personal_descriptions_translated: 0,
      evidence_translated: 0,
      roles_translated: 0,
      errors: 0,
    };

    // 1) user_personal_actors: actor_description + analysis_data JSONB
    const { data: actors } = await admin
      .from("user_personal_actors")
      .select("id, actor_description, analysis_data")
      .limit(500);

    for (const row of actors ?? []) {
      counts.personal_actors_scanned += 1;
      let dirty = false;
      let newDesc = row.actor_description as string | null;
      let newAnalysis = row.analysis_data as unknown;

      if (looksNorwegian(row.actor_description)) {
        try {
          newDesc = await translate(row.actor_description as string, lovableApiKey);
          counts.personal_descriptions_translated += 1;
          dirty = true;
        } catch {
          counts.errors += 1;
        }
      }

      // Quick string-level check before walking JSON
      const rawJson = JSON.stringify(row.analysis_data ?? null);
      if (rawJson && NO_RE.test(rawJson)) {
        const counter = { changed: 0 };
        newAnalysis = await translateJsonInPlace(row.analysis_data, lovableApiKey, counter);
        if (counter.changed > 0) {
          counts.personal_fields_translated += counter.changed;
          dirty = true;
        }
      }

      if (dirty) {
        const { error } = await admin
          .from("user_personal_actors")
          .update({
            actor_description: newDesc,
            analysis_data: newAnalysis as never,
          })
          .eq("id", row.id);
        if (error) counts.errors += 1;
        else counts.personal_actors_updated += 1;
      }
    }

    // 2) actor_ontology_tags.evidence
    const { data: tags } = await admin
      .from("actor_ontology_tags")
      .select("id, evidence")
      .not("evidence", "is", null)
      .limit(2000);
    for (const t of tags ?? []) {
      if (!looksNorwegian(t.evidence)) continue;
      try {
        const translated = await translate(t.evidence as string, lovableApiKey);
        if (translated && translated !== t.evidence) {
          const { error } = await admin
            .from("actor_ontology_tags")
            .update({ evidence: translated })
            .eq("id", t.id);
          if (error) counts.errors += 1;
          else counts.evidence_translated += 1;
        }
      } catch {
        counts.errors += 1;
      }
    }

    // 3) actor_contacts.title
    const { data: contacts } = await admin
      .from("actor_contacts")
      .select("id, title")
      .not("title", "is", null)
      .limit(2000);
    for (const c of contacts ?? []) {
      if (!looksNorwegian(c.title)) continue;
      try {
        const translated = await translate(c.title as string, lovableApiKey);
        if (translated && translated !== c.title) {
          const { error } = await admin
            .from("actor_contacts")
            .update({ title: translated })
            .eq("id", c.id);
          if (error) counts.errors += 1;
          else counts.roles_translated += 1;
        }
      } catch {
        counts.errors += 1;
      }
    }

    return new Response(JSON.stringify(counts), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
