import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  ProgrammeSummary,
  VerificationActivityEntry,
  DecayWarningEntry,
  MemberContribution,
} from "@/types/analytics";

const EMPTY_SUMMARY: ProgrammeSummary = {
  session_count: 0,
  member_count: 0,
  verified_actor_count: 0,
  pending_suggestion_count: 0,
  decay_warning_count: 0,
};

export function useProgrammeAnalytics(programmeId: string | null | undefined) {
  const [summary, setSummary] = useState<ProgrammeSummary>(EMPTY_SUMMARY);
  const [activity, setActivity] = useState<VerificationActivityEntry[]>([]);
  const [decay, setDecay] = useState<DecayWarningEntry[]>([]);
  const [members, setMembers] = useState<MemberContribution[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programmeId) {
      setSummary(EMPTY_SUMMARY);
      setActivity([]);
      setDecay([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Top stats
    const { data: sumRows } = await supabase.rpc("fn_programme_summary", {
      p_programme_id: programmeId,
    });
    const sum = (sumRows?.[0] ?? EMPTY_SUMMARY) as ProgrammeSummary;
    setSummary(sum);

    // Verification activity
    const { data: events } = await supabase
      .from("verification_events")
      .select("id, actor_id, verifier_id, verifier_confidence, decays_at, created_at")
      .eq("programme_id", programmeId)
      .eq("verification_status", "complete")
      .order("created_at", { ascending: false })
      .limit(20);

    const actorIds = Array.from(new Set((events ?? []).map((e) => e.actor_id)));
    const verifierIds = Array.from(
      new Set((events ?? []).map((e) => e.verifier_id).filter((x): x is string => !!x)),
    );

    const [actorsRes, verifiersRes] = await Promise.all([
      actorIds.length
        ? supabase.from("actors").select("id, legal_name, decays_at").in("id", actorIds)
        : Promise.resolve({ data: [] as { id: string; legal_name: string; decays_at: string | null }[] }),
      verifierIds.length
        ? supabase.from("users").select("id, name").in("id", verifierIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const actorMap = new Map((actorsRes.data ?? []).map((a) => [a.id, a]));
    const verifierMap = new Map((verifiersRes.data ?? []).map((u) => [u.id, u.name]));

    setActivity(
      (events ?? []).map((e) => ({
        event_id: e.id,
        actor_id: e.actor_id,
        actor_name: actorMap.get(e.actor_id)?.legal_name ?? "Unknown actor",
        verifier_name: e.verifier_id ? verifierMap.get(e.verifier_id) ?? null : null,
        confidence: (e.verifier_confidence ?? null) as "high" | "medium" | "low" | null,
        decays_at: e.decays_at,
        created_at: e.created_at,
      })),
    );

    // Decay warnings — restrict to actors verified within this programme
    const { data: progActorRows } = await supabase
      .from("verification_events")
      .select("actor_id")
      .eq("programme_id", programmeId);
    const progActorIds = Array.from(
      new Set((progActorRows ?? []).map((r) => r.actor_id)),
    );
    if (progActorIds.length > 0) {
      const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: decayRows } = await supabase
        .from("actors")
        .select("id, legal_name, decays_at")
        .in("id", progActorIds)
        .not("decays_at", "is", null)
        .lte("decays_at", horizon)
        .order("decays_at", { ascending: true });

      const now = Date.now();
      setDecay(
        (decayRows ?? []).map((a) => {
          const d = new Date(a.decays_at!).getTime();
          const daysUntil = Math.round((d - now) / (24 * 60 * 60 * 1000));
          return {
            actor_id: a.id,
            actor_name: a.legal_name,
            decays_at: a.decays_at!,
            state: d <= now ? "expired" : "decay_warning",
            days_until: daysUntil,
          };
        }),
      );
    } else {
      setDecay([]);
    }

    // Member contributions
    const { data: memberRows } = await supabase
      .from("programme_members")
      .select("user_id, role")
      .eq("programme_id", programmeId);

    const memberIds = (memberRows ?? []).map((m) => m.user_id);
    const userNamesRes = memberIds.length
      ? await supabase.from("users").select("id, name").in("id", memberIds)
      : { data: [] as { id: string; name: string }[] };
    const nameMap = new Map((userNamesRes.data ?? []).map((u) => [u.id, u.name]));

    // Verification counts per member
    const { data: vCounts } = await supabase
      .from("verification_events")
      .select("verifier_id")
      .eq("programme_id", programmeId);
    const vMap = new Map<string, number>();
    for (const r of vCounts ?? []) {
      if (r.verifier_id) vMap.set(r.verifier_id, (vMap.get(r.verifier_id) ?? 0) + 1);
    }

    // Suggestions made via sessions belonging to this programme
    const { data: progSessions } = await supabase
      .from("search_sessions")
      .select("id")
      .eq("programme_id", programmeId);
    const sessionIds = (progSessions ?? []).map((s) => s.id);
    const sMap = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: personalActors } = await supabase
        .from("user_personal_actors")
        .select("id, user_id, status")
        .in("source_session_id", sessionIds)
        .in("status", ["suggested", "merged"]);
      for (const r of personalActors ?? []) {
        sMap.set(r.user_id, (sMap.get(r.user_id) ?? 0) + 1);
      }
    }

    setMembers(
      (memberRows ?? []).map((m) => ({
        user_id: m.user_id,
        user_name: nameMap.get(m.user_id) ?? null,
        role: m.role as MemberContribution["role"],
        verifications_count: vMap.get(m.user_id) ?? 0,
        suggestions_made_count: sMap.get(m.user_id) ?? 0,
      })),
    );

    setLoading(false);
  }, [programmeId]);

  useEffect(() => {
    load();
  }, [load]);

  return { summary, activity, decay, members, loading, refresh: load };
}
