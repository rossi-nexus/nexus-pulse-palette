// Phase 6.5.5a: lists programmes the current user manages (owner/consultant).
// Drives the consultant-workspace landing page and the workspace-switcher
// access gate. Per Q (resolved 2026-04-28 to option (b)), workspace access
// derives from programme_members membership — no new ABAC attribute.
import { useEffect, useState, useCallback } from "react";
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

    const { data: memberRows } = await supabase
      .from("programme_members")
      .select("programme_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "consultant"]);

    const programmeIds = (memberRows ?? []).map((r) => r.programme_id);
    if (programmeIds.length === 0) {
      setProgrammes([]);
      setLoading(false);
      return;
    }

    const { data: progRows } = await supabase
      .from("programmes")
      .select("id, name, description, client_org, status")
      .in("id", programmeIds)
      .order("updated_at", { ascending: false });

    const result: ManagedProgramme[] = [];
    for (const prog of progRows ?? []) {
      const role = (memberRows ?? []).find((r) => r.programme_id === prog.id)
        ?.role as "owner" | "consultant";
      const { count: memberCount } = await supabase
        .from("programme_members")
        .select("*", { count: "exact", head: true })
        .eq("programme_id", prog.id);
      const { count: sessionCount } = await supabase
        .from("search_sessions")
        .select("*", { count: "exact", head: true })
        .eq("programme_id", prog.id);
      result.push({
        id: prog.id,
        name: prog.name,
        description: prog.description,
        client_org: prog.client_org,
        status: prog.status as "active" | "archived",
        role,
        member_count: memberCount ?? 0,
        session_count: sessionCount ?? 0,
      });
    }

    setProgrammes(result);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { programmes, loading, hasAccess: programmes.length > 0, refresh: load };
}
