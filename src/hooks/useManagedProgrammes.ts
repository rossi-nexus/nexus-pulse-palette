// Phase 6.5.5a: lists programmes the current user manages (owner/consultant).
// Drives the consultant-workspace landing page and the workspace-switcher
// access gate. Per Q (resolved 2026-04-28 to option (b)), workspace access
// derives from programme_members membership — no new ABAC attribute.
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ManagedProgramme } from "@/types/consultant";

export type { ManagedProgramme } from "@/types/consultant";

export function useManagedProgrammes() {
  const { user } = useAuth();
  const [programmes, setProgrammes] = useState<ManagedProgramme[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProgrammes([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const { data: memberRows, error: memErr } = await supabase
        .from("programme_members")
        .select("programme_id, role")
        .eq("user_id", user.id)
        .in("role", ["owner", "consultant"]);
      if (memErr) throw memErr;

      const programmeIds = (memberRows ?? []).map((r) => r.programme_id);
      if (programmeIds.length === 0) {
        setProgrammes([]);
        return;
      }

      const { data: progRows, error: progErr } = await supabase
        .from("programmes")
        .select("id, name, description, client_org, status")
        .in("id", programmeIds)
        .order("updated_at", { ascending: false });
      if (progErr) throw progErr;

      const result: ManagedProgramme[] = [];
      for (const prog of progRows ?? []) {
        const role = (memberRows ?? []).find((r) => r.programme_id === prog.id)
          ?.role as "owner" | "consultant";
        const [memCountRes, sessCountRes] = await Promise.all([
          supabase
            .from("programme_members")
            .select("*", { count: "exact", head: true })
            .eq("programme_id", prog.id),
          supabase
            .from("search_sessions")
            .select("*", { count: "exact", head: true })
            .eq("programme_id", prog.id),
        ]);
        if (memCountRes.error) throw memCountRes.error;
        if (sessCountRes.error) throw sessCountRes.error;
        result.push({
          id: prog.id,
          name: prog.name,
          description: prog.description,
          client_org: prog.client_org,
          status: prog.status as "active" | "archived",
          role,
          member_count: memCountRes.count ?? 0,
          session_count: sessCountRes.count ?? 0,
        });
      }

      setProgrammes(result);
    } catch (e: any) {
      toast.error(`Failed to load managed programmes: ${e?.message ?? "Unknown error"}`);
      setProgrammes([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { programmes, loading, hasAccess: programmes.length > 0, refresh: load };
}
