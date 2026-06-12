import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionContext } from "@/contexts/SessionContext";

export interface TopbarStats {
  step: number | null;     // 1..5, derived from locked count + 1
  totalSteps: number;       // always 5
  verified: number | null;
  pending: number | null;   // null = hidden (not consultant/admin)
  decay: number | null;     // null = hidden (not consultant/admin)
  loading: boolean;
}

const DEFAULT: TopbarStats = {
  step: null,
  totalSteps: 5,
  verified: null,
  pending: null,
  decay: null,
  loading: true,
};

/**
 * VR-02: read-only stats for the topbar status chips. All values come from
 * existing RLS-protected tables; admin/consultant chips remain null and are
 * hidden gracefully for plain users.
 */
export function useTopbarStats(): TopbarStats {
  const { sessionId, isAdmin } = useSessionContext();
  const [stats, setStats] = useState<TopbarStats>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: TopbarStats = { ...DEFAULT, loading: false };

      // Active pipeline step from locked steps
      if (sessionId) {
        const { data } = await supabase
          .from("session_step_states")
          .select("step_number, status")
          .eq("session_id", sessionId);
        const lockedCount = (data ?? []).filter((r: any) => r.status === "locked").length;
        next.step = Math.min(5, lockedCount + 1);
      } else {
        next.step = 1;
      }

      // Verified actor count (RLS-permitted for all authenticated users)
      try {
        const { count } = await supabase
          .from("actors")
          .select("id", { count: "exact", head: true });
        next.verified = count ?? 0;
      } catch {
        next.verified = null;
      }

      // Admin/consultant-only chips
      if (isAdmin) {
        try {
          const { data: row } = await (supabase.rpc as any)("fn_admin_dashboard_summary");
          const r = Array.isArray(row) ? row[0] : row;
          if (r) {
            const q = (r.validation_queue_by_status ?? {}) as Record<string, number>;
            next.pending = Number(q.pending ?? 0);
            next.decay = Number(r.decay_due_30d ?? 0);
          }
        } catch {
          /* leave null */
        }
      }

      if (!cancelled) setStats(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, isAdmin]);

  return stats;
}
