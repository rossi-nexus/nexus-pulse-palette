// Phase 6.5.6: load programme outcomes for a programme (with joined names).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  OutcomeType,
  ProgrammeOutcomeWithContext,
} from "@/types/outcome";

export function useProgrammeOutcomes(programmeId: string | undefined) {
  const [outcomes, setOutcomes] = useState<ProgrammeOutcomeWithContext[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programmeId) {
      setOutcomes([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: rows } = await supabase
      .from("programme_outcomes")
      .select("*")
      .eq("programme_id", programmeId)
      .order("recorded_at", { ascending: false });

    if (!rows || rows.length === 0) {
      setOutcomes([]);
      setLoading(false);
      return;
    }

    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id)));
    const userIds = Array.from(
      new Set(rows.map((r) => r.recorded_by).filter(Boolean) as string[]),
    );
    const [{ data: actors }, { data: users }, { data: prog }] = await Promise.all([
      supabase.from("actors").select("id, legal_name").in("id", actorIds),
      userIds.length
        ? supabase.from("users").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
      supabase.from("programmes").select("name").eq("id", programmeId).maybeSingle(),
    ]);

    const actorMap = new Map((actors ?? []).map((a) => [a.id, a.legal_name]));
    const userMap = new Map(
      (users ?? []).map((u: any) => [u.id, u.name || u.email]),
    );
    const progName = prog?.name ?? "";

    setOutcomes(
      rows.map((r) => ({
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
        programme_name: progName,
        actor_name: actorMap.get(r.actor_id) ?? "Unknown actor",
      })),
    );
    setLoading(false);
  }, [programmeId]);

  useEffect(() => {
    load();
  }, [load]);

  return { outcomes, loading, refresh: load };
}
