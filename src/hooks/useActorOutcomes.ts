// Phase 6.5.6: load outcomes for a single actor across accessible programmes.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_OUTCOME_SUMMARY,
  type OutcomeSummary,
  type OutcomeType,
  type ProgrammeOutcomeWithContext,
} from "@/types/outcome";

export function useActorOutcomes(actorId: string | undefined) {
  const [outcomes, setOutcomes] = useState<ProgrammeOutcomeWithContext[]>([]);
  const [summary, setSummary] = useState<OutcomeSummary>({ ...EMPTY_OUTCOME_SUMMARY });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!actorId) {
      setOutcomes([]);
      setSummary({ ...EMPTY_OUTCOME_SUMMARY });
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: rows } = await supabase
      .from("programme_outcomes")
      .select("*")
      .eq("actor_id", actorId)
      .order("recorded_at", { ascending: false });

    if (!rows || rows.length === 0) {
      setOutcomes([]);
      setSummary({ ...EMPTY_OUTCOME_SUMMARY });
      setLoading(false);
      return;
    }

    const programmeIds = Array.from(new Set(rows.map((r) => r.programme_id)));
    const userIds = Array.from(
      new Set(rows.map((r) => r.recorded_by).filter(Boolean) as string[]),
    );
    const [{ data: progs }, { data: users }, { data: actor }] = await Promise.all([
      supabase.from("programmes").select("id, name").in("id", programmeIds),
      userIds.length
        ? supabase.from("users").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("actors").select("legal_name").eq("id", actorId).maybeSingle(),
    ]);

    const progMap = new Map((progs ?? []).map((p) => [p.id, p.name]));
    const userMap = new Map(
      (users ?? []).map((u: any) => [u.id, u.name || u.email]),
    );
    const actorName = actor?.legal_name ?? "";

    const tally: OutcomeSummary = { ...EMPTY_OUTCOME_SUMMARY };
    const enriched = rows.map((r) => {
      tally[r.outcome_type as OutcomeType] =
        (tally[r.outcome_type as OutcomeType] ?? 0) + 1;
      return {
        id: r.id,
        programme_id: r.programme_id,
        actor_id: r.actor_id,
        outcome_type: r.outcome_type as OutcomeType,
        notes: r.notes,
        evidence: Array.isArray(r.evidence) ? (r.evidence as any[]) : [],
        recorded_by: r.recorded_by,
        recorded_at: r.recorded_at,
        completed_at: r.completed_at,
        recorded_by_name: r.recorded_by ? userMap.get(r.recorded_by) ?? null : null,
        programme_name: progMap.get(r.programme_id) ?? "Unknown programme",
        actor_name: actorName,
      };
    });

    setOutcomes(enriched);
    setSummary(tally);
    setLoading(false);
  }, [actorId]);

  useEffect(() => {
    load();
  }, [load]);

  return { outcomes, summary, loading, refresh: load };
}
