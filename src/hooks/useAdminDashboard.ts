import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AdminDashboardData {
  actor_total: number;
  actor_verified: number;
  actor_unverified: number;
  decay_expired: number;
  decay_due_30d: number;
  verification_events_7d: number;
  verification_events_30d: number;
  validation_queue_by_status: Record<string, number>;
  ontology_active: number;
  ontology_proposed: number;
  ontology_archived: number;
  ontology_decisions_7d: number;
  ontology_decisions_30d: number;
  programme_total: number;
  user_total: number;
  user_admin: number;
  attribute_holders_by_kv: Record<string, number>;
  audit_events_7d: number;
  audit_events_30d: number;
  audit_top_event_types_7d: Array<{ event_type: string; count: number }>;
  registry_imports_by_action_30d: Record<string, number>;
}

export function useAdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: rows, error: rpcErr } = await (supabase.rpc as any)(
        "fn_admin_dashboard_summary",
      );
      if (rpcErr) {
        const msg = (rpcErr as any).message ?? "Failed to load admin dashboard";
        setError(msg);
        toast.error(msg);
        console.error("fn_admin_dashboard_summary error", rpcErr);
        return;
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) {
        setData(row as AdminDashboardData);
        setError(null);
      }
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load admin dashboard";
      setError(msg);
      toast.error(msg);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  return { data, loading: loading || authLoading, error, refresh: load };
}
