// C2: data hook for the ontology proposed-queue admin surface. Joins
// ontology_entries (status='proposed') with ontology_categories for parent
// metadata, and with audit_log to recover consultant + source-actor context.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface ProposedEntryRow {
  id: string;
  raw_name: string;
  description: string | null;
  created_at: string;
  category_id: string;
  parent_category: string;
  parent_category_description: string | null;
  parent_category_keywords: string[];
  parent_category_examples: string[];
  parent_category_co_occurring: string[];
  headline: "capability" | "competence" | "domain" | "product_type" | "service_type";
  // From audit_log (originating ontology_proposal_decision event)
  consultant_user_id: string | null;
  consultant_name: string | null;
  consultant_email: string | null;
  source_actor_id: string | null;
  source_actor_name: string | null;
  produced_via: string | null;
  original_proposed_description: string | null;
  mapped_to_entry_id: string | null;
  mapped_to_entry_name: string | null;
  audit_reason: string | null;
}

export function useOntologyQueue() {
  const [items, setItems] = useState<ProposedEntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: entries, error: entriesErr } = await supabase
        .from("ontology_entries")
        .select("id, raw_name, description, created_at, category_id")
        .eq("status", "proposed")
        .order("created_at", { ascending: false });
      if (entriesErr) throw entriesErr;

      const entryRows = (entries ?? []) as Array<{
        id: string;
        raw_name: string;
        description: string | null;
        created_at: string;
        category_id: string;
      }>;

      if (entryRows.length === 0) {
        setItems([]);
        return;
      }

      const categoryIds = Array.from(new Set(entryRows.map((e) => e.category_id)));
      const { data: cats, error: catsErr } = await supabase
        .from("ontology_categories")
        .select("id, type, normalized_name, description, keywords, example_entries, co_occurring_category_ids");
      if (catsErr) throw catsErr;
      const catMap = new Map<string, any>();
      for (const c of cats ?? []) catMap.set(c.id, c);

      // Resolve co-occurring category names
      const coOccurringNames = new Map<string, string>();
      for (const c of cats ?? []) coOccurringNames.set(c.id, c.normalized_name);

      // Fetch originating audit events. Join via changes->>'new_entry_id'.
      const entryIds = entryRows.map((e) => e.id);
      const { data: auditRows, error: auditErr } = await supabase
        .from("audit_log")
        .select("actor_user_id, target_record_id, changes, reason, created_at")
        .eq("event_type", "ontology_proposal_decision")
        .in("target_table", ["actors"]);
      if (auditErr) throw auditErr;

      // Build map keyed by new_entry_id.
      const auditByEntry = new Map<string, any>();
      for (const a of auditRows ?? []) {
        const newId = (a.changes as any)?.new_entry_id;
        if (newId && entryIds.includes(newId)) {
          auditByEntry.set(newId, a);
        }
      }

      // Resolve consultant users + source actors + mapped entries.
      const consultantIds = new Set<string>();
      const actorIds = new Set<string>();
      const mappedEntryIds = new Set<string>();
      for (const a of auditByEntry.values()) {
        if (a.actor_user_id) consultantIds.add(a.actor_user_id);
        if (a.target_record_id) actorIds.add(a.target_record_id);
        const m = (a.changes as any)?.mapped_to_entry_id;
        if (m) mappedEntryIds.add(m);
      }

      const usersMap = new Map<string, { name: string | null; email: string | null }>();
      if (consultantIds.size) {
        const { data: u } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", Array.from(consultantIds));
        for (const r of u ?? []) usersMap.set(r.id, { name: r.name, email: r.email });
      }

      const actorsMap = new Map<string, string>();
      if (actorIds.size) {
        const { data: a } = await supabase
          .from("actors")
          .select("id, legal_name")
          .in("id", Array.from(actorIds));
        for (const r of a ?? []) actorsMap.set(r.id, r.legal_name);
      }

      const mappedMap = new Map<string, string>();
      if (mappedEntryIds.size) {
        const { data: e } = await supabase
          .from("ontology_entries")
          .select("id, raw_name")
          .in("id", Array.from(mappedEntryIds));
        for (const r of e ?? []) mappedMap.set(r.id, r.raw_name);
      }

      const result: ProposedEntryRow[] = entryRows.map((e) => {
        const cat = catMap.get(e.category_id);
        const audit = auditByEntry.get(e.id);
        const consultantId = audit?.actor_user_id ?? null;
        const consultantInfo = consultantId ? usersMap.get(consultantId) : null;
        const sourceActorId = audit?.target_record_id ?? null;
        const mappedId = (audit?.changes as any)?.mapped_to_entry_id ?? null;
        const coIds = (cat?.co_occurring_category_ids ?? []) as string[];
        return {
          id: e.id,
          raw_name: e.raw_name,
          description: e.description,
          created_at: e.created_at,
          category_id: e.category_id,
          parent_category: cat?.normalized_name ?? "(unknown)",
          parent_category_description: cat?.description ?? null,
          parent_category_keywords: (cat?.keywords ?? []) as string[],
          parent_category_examples: (cat?.example_entries ?? []) as string[],
          parent_category_co_occurring: coIds.map((id) => coOccurringNames.get(id) ?? id),
          headline: (cat?.type ?? "capability") as ProposedEntryRow["headline"],
          consultant_user_id: consultantId,
          consultant_name: consultantInfo?.name ?? null,
          consultant_email: consultantInfo?.email ?? null,
          source_actor_id: sourceActorId,
          source_actor_name: sourceActorId ? actorsMap.get(sourceActorId) ?? null : null,
          produced_via: (audit?.changes as any)?.action ?? null,
          original_proposed_description: (audit?.changes as any)?.proposed_description ?? null,
          mapped_to_entry_id: mappedId,
          mapped_to_entry_name: mappedId ? mappedMap.get(mappedId) ?? null : null,
          audit_reason: audit?.reason ?? null,
        };
      });

      setItems(result);
    } catch (e: any) {
      toast.error(`Failed to load ontology queue: ${e?.message ?? "Unknown error"}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, refresh: load };
}
