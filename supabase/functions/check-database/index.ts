import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalyzedActorIn {
  id: string;
  name: string;
  website?: string;
  org_number?: string;
  country?: string;
  actor_type: string;
  role_names: string[];
  ontology_tags?: {
    capabilities?: string[];
    domains?: string[];
    product_types?: string[];
    service_types?: string[];
  };
}

interface SavedForLaterIn {
  id: string;
  name: string;
  website?: string;
  actor_type: string;
  role_name: string;
}

interface CheckRequest {
  analyzed_actors: AnalyzedActorIn[];
  saved_for_later: SavedForLaterIn[];
  session_id: string;
}

interface ExactMatchResult {
  session_actor_id: string;
  db_actor_id: string;
  db_actor_name: string;
  verification_status: string;
  last_updated: string;
  profile_completeness: string[];
}

interface SimilarActorResult {
  db_actor_id: string;
  actor_name: string;
  similarity_basis: string;
  capacity_summary?: string;
  classification_summary?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as CheckRequest;
    if (!body || !Array.isArray(body.analyzed_actors)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: analyzed_actors[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const analyzed = body.analyzed_actors || [];
    const matches: ExactMatchResult[] = [];
    const notInDatabase: string[] = [];

    // ── Phase 1: Exact match (org_number first, then case-insensitive legal name) ──
    for (const actor of analyzed) {
      let matched: any = null;

      if (actor.org_number && actor.org_number.trim()) {
        const { data } = await supabase
          .from("actors")
          .select("id, legal_name, verification_status, updated_at, data_completeness, country")
          .eq("org_number", actor.org_number.trim())
          .maybeSingle();
        if (data) matched = data;
      }

      if (!matched && actor.name) {
        let q = supabase
          .from("actors")
          .select("id, legal_name, verification_status, updated_at, data_completeness, country")
          .ilike("legal_name", actor.name.trim());
        if (actor.country) q = q.eq("country", actor.country);
        const { data } = await q.maybeSingle();
        if (data) matched = data;

        // Fallback: try without country filter
        if (!matched && actor.country) {
          const { data: any2 } = await supabase
            .from("actors")
            .select("id, legal_name, verification_status, updated_at, data_completeness, country")
            .ilike("legal_name", actor.name.trim())
            .maybeSingle();
          if (any2) matched = any2;
        }
      }

      if (matched) {
        matches.push({
          session_actor_id: actor.id,
          db_actor_id: matched.id,
          db_actor_name: matched.legal_name,
          verification_status: matched.verification_status || "unverified",
          last_updated: matched.updated_at,
          profile_completeness: matched.data_completeness || [],
        });
      } else {
        notInDatabase.push(actor.name);
      }
    }

    // ── Phase 2: Similarity search ──
    const matchedIds = new Set(matches.map((m) => m.db_actor_id));
    const analyzedNamesLower = new Set(analyzed.map((a) => a.name.toLowerCase()));

    const ontologyNames = new Set<string>();
    for (const a of analyzed) {
      const t = a.ontology_tags || {};
      for (const arr of [t.capabilities, t.domains, t.product_types, t.service_types]) {
        for (const name of arr || []) ontologyNames.add(name);
      }
    }

    const suggestions: SimilarActorResult[] = [];
    if (ontologyNames.size > 0) {
      const { data: entries } = await supabase
        .from("ontology_entries")
        .select("id, raw_name")
        .in("raw_name", Array.from(ontologyNames));

      const entryIds = (entries || []).map((e: any) => e.id);
      const entryNameById = new Map((entries || []).map((e: any) => [e.id, e.raw_name as string]));

      if (entryIds.length > 0) {
        const { data: tags } = await supabase
          .from("actor_ontology_tags")
          .select("actor_id, ontology_entry_id, actors:actors!inner(id, legal_name, verification_status)")
          .in("ontology_entry_id", entryIds);

        const perActor = new Map<
          string,
          { name: string; verification: string; entries: Set<string> }
        >();
        for (const t of tags || []) {
          const aId = (t as any).actor_id as string;
          if (matchedIds.has(aId)) continue;
          const actorRow = (t as any).actors as { id: string; legal_name: string; verification_status: string } | null;
          if (!actorRow) continue;
          if (analyzedNamesLower.has(actorRow.legal_name.toLowerCase())) continue;
          const entryName = entryNameById.get((t as any).ontology_entry_id as string) || "";
          const cur = perActor.get(aId) || {
            name: actorRow.legal_name,
            verification: actorRow.verification_status || "unverified",
            entries: new Set<string>(),
          };
          if (entryName) cur.entries.add(entryName);
          perActor.set(aId, cur);
        }

        const rows = Array.from(perActor.entries())
          .map(([id, v]) => ({ id, ...v, count: v.entries.size }))
          .filter((r) => r.count >= 2)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        for (const r of rows) {
          const list = Array.from(r.entries).slice(0, 3).join(", ");
          suggestions.push({
            db_actor_id: r.id,
            actor_name: r.name,
            similarity_basis: `Shares ${r.count} matching tag${r.count === 1 ? "" : "s"}: ${list}`,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        phase1: {
          matches,
          not_in_database: notInDatabase,
        },
        phase2: {
          suggestions,
        },
        summary: {
          total_checked: analyzed.length,
          exact_matches: matches.length,
          not_in_database: notInDatabase.length,
          similar_found: suggestions.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
