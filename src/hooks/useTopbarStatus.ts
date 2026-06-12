// VR-01 — Topbar situational status hook.
// READ-ONLY across already-allowed paths. No new RPC, no new RLS surface.
// All branches degrade silently to null on error so chips just hide.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSessionContext } from "@/contexts/SessionContext";
import { useConsultantAccess } from "@/hooks/useConsultantAccess";

interface Status {
  sessionStep: number | null;        // 1..5
  sessionTotal: number;              // always 5
  verifiedActors: number | null;
  pendingVerification: number | null; // consultant/admin only
  decayLt30: number | null;
  showPending: boolean;              // gate for pending chip
}

const TOTAL_STEPS = 5;
const STEP_TO_NUM: Record<string, number> = { A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 };

export function useTopbarStatus(): Status {
  const { user } = useAuth();
  const { sessionId, isAdmin } = useSessionContext();
  const { hasAccess: hasConsultantAccess } = useConsultantAccess();
  const [verifiedActors, setVerifiedActors] = useState<number | null>(null);
  const [pendingVerification, setPendingVerification] = useState<number | null>(null);
  const [decayLt30, setDecayLt30] = useState<number | null>(null);
  const [sessionStep, setSessionStep] = useState<number | null>(null);

  const showPending = isAdmin || hasConsultantAccess;

  // Session step progress — read from session_step_states.
  useEffect(() => {
    if (!sessionId) {
      setSessionStep(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("session_step_states")
        .select("step, status")
        .eq("session_id", sessionId);
      if (cancelled) return;
      if (error || !data) {
        setSessionStep(null);
        return;
      }
      let highestLocked = 0;
      for (const row of data as Array<{ step: string; status: string }>) {
        const n = STEP_TO_NUM[row.step] ?? 0;
        if (row.status === "locked" && n > highestLocked) highestLocked = n;
      }
      const current = Math.min(TOTAL_STEPS, Math.max(1, highestLocked + 1));
      setSessionStep(current);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Verified actors count.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("actors")
        .select("id", { count: "exact", head: true })
        .not("verified_at", "is", null);
      if (cancelled) return;
      setVerifiedActors(error ? null : count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Decay < 30d: verified records whose decays_at is within next 30 days.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { count, error } = await supabase
        .from("actors")
        .select("id", { count: "exact", head: true })
        .not("verified_at", "is", null)
        .not("decays_at", "is", null)
        .gte("decays_at", now.toISOString())
        .lte("decays_at", in30.toISOString());
      if (cancelled) return;
      setDecayLt30(error ? null : count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Pending verification: validation queue for consultants/admins.
  useEffect(() => {
    if (!showPending || !user) {
      setPendingVerification(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // Try common queue surface; fail silent.
      const { count, error } = await supabase
        .from("user_personal_actors")
        .select("id", { count: "exact", head: true })
        .eq("status", "suggested");
      if (cancelled) return;
      setPendingVerification(error ? null : count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [showPending, user]);

  return {
    sessionStep,
    sessionTotal: TOTAL_STEPS,
    verifiedActors,
    pendingVerification,
    decayLt30,
    showPending,
  };
}
