// Profile Queue Part 2 / P4: client-side duplicate scanner used by bulk
// verify (actors) and bulk merge (ontology). Reuses the trigram similarity
// helper from src/lib/fuzzyMatch and the same heuristics as P7:
//   - actors: legal_name ILIKE / similarity + org_number exact
//   - ontology: raw_name similarity within parent category
//
// Returns Map<inputId, candidates[]> sorted by descending score.
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { similarity } from "@/lib/fuzzyMatch";

export interface ActorDupInput {
  id: string;
  legal_name: string;
  org_number?: string | null;
  country?: string | null;
}

export interface ActorDupCandidate {
  actor_id: string;
  legal_name: string;
  org_number: string | null;
  country: string | null;
  city: string | null;
  postal_code: string | null;
  street_address: string | null;
  verification_status: string;
  verified_at: string | null;
  score: number;
  match_reason: "org_number" | "name";
}

export interface OntologyDupInput {
  id: string;
  raw_name: string;
  category_id: string;
}

export interface OntologyDupCandidate {
  entry_id: string;
  raw_name: string;
  category_id: string;
  description: string | null;
  score: number;
}

const ACTOR_NAME_THRESHOLD = 0.55;
const ONT_NAME_THRESHOLD = 0.6;

export function useDuplicateScanner() {
  const scanActors = useCallback(
    async (inputs: ActorDupInput[]): Promise<Map<string, ActorDupCandidate[]>> => {
      const out = new Map<string, ActorDupCandidate[]>();
      if (inputs.length === 0) return out;

      // Pull a candidate pool: actors that share org_number with any input,
      // or whose legal_name shares a leading token. At current scale (15
      // actors) we just fetch all and score in JS.
      const { data, error } = await supabase
        .from("actors")
        .select(
          "id, legal_name, org_number, country, city, postal_code, street_address, verification_status, verified_at, merged_into_id",
        )
        .is("merged_into_id", null);
      if (error) throw error;
      const pool = (data ?? []) as Array<{
        id: string;
        legal_name: string;
        org_number: string | null;
        country: string | null;
        city: string | null;
        postal_code: string | null;
        street_address: string | null;
        verification_status: string;
        verified_at: string | null;
      }>;

      for (const input of inputs) {
        const matches: ActorDupCandidate[] = [];
        for (const row of pool) {
          if (input.org_number && row.org_number && input.org_number.trim() === row.org_number.trim()) {
            matches.push({
              actor_id: row.id,
              legal_name: row.legal_name,
              org_number: row.org_number,
              country: row.country,
              city: row.city,
              postal_code: row.postal_code,
              street_address: row.street_address,
              verification_status: row.verification_status,
              verified_at: row.verified_at,
              score: 1,
              match_reason: "org_number",
            });
            continue;
          }
          const score = similarity(input.legal_name, row.legal_name);
          if (score >= ACTOR_NAME_THRESHOLD) {
            matches.push({
              actor_id: row.id,
              legal_name: row.legal_name,
              org_number: row.org_number,
              country: row.country,
              city: row.city,
              postal_code: row.postal_code,
              street_address: row.street_address,
              verification_status: row.verification_status,
              verified_at: row.verified_at,
              score,
              match_reason: "name",
            });
          }
        }
        matches.sort((a, b) => b.score - a.score);
        if (matches.length > 0) out.set(input.id, matches.slice(0, 5));
      }
      return out;
    },
    [],
  );

  const scanOntology = useCallback(
    async (inputs: OntologyDupInput[]): Promise<Map<string, OntologyDupCandidate[]>> => {
      const out = new Map<string, OntologyDupCandidate[]>();
      if (inputs.length === 0) return out;
      const catIds = Array.from(new Set(inputs.map((i) => i.category_id)));
      const { data, error } = await supabase
        .from("ontology_entries")
        .select("id, raw_name, description, category_id, status")
        .in("category_id", catIds)
        .eq("status", "active");
      if (error) throw error;
      const pool = (data ?? []) as Array<{
        id: string;
        raw_name: string;
        description: string | null;
        category_id: string;
      }>;
      for (const input of inputs) {
        const matches: OntologyDupCandidate[] = [];
        for (const row of pool) {
          if (row.category_id !== input.category_id) continue;
          if (row.id === input.id) continue;
          const score = similarity(input.raw_name, row.raw_name);
          if (score >= ONT_NAME_THRESHOLD) {
            matches.push({
              entry_id: row.id,
              raw_name: row.raw_name,
              category_id: row.category_id,
              description: row.description,
              score,
            });
          }
        }
        matches.sort((a, b) => b.score - a.score);
        if (matches.length > 0) out.set(input.id, matches.slice(0, 5));
      }
      return out;
    },
    [],
  );

  return { scanActors, scanOntology };
}
