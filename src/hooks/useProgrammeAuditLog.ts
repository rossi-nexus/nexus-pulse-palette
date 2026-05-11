import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ProgrammeAuditEntry } from "@/types/analytics";

const LIMIT = 50;

function summariseChanges(eventType: string, changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  const c = changes as Record<string, unknown>;
  if (eventType === "mutation") {
    const keys = Object.keys(c).filter((k) => k !== "new" && k !== "old");
    if (keys.length === 0) return "modified record";
    return `changed ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "…" : ""}`;
  }
  return "";
}

export function useProgrammeAuditLog(programmeId: string | null | undefined) {
  const [entries, setEntries] = useState<ProgrammeAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!programmeId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const { data: rows, error: rowsErr } = await supabase
        .from("audit_log")
        .select("id, event_type, target_table, target_record_id, actor_user_id, changes, created_at")
        .eq("programme_id", programmeId)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (rowsErr) throw rowsErr;

      const userIds = Array.from(
        new Set((rows ?? []).map((r) => r.actor_user_id).filter((x): x is string => !!x)),
      );
      const userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users, error: usrErr } = await supabase
          .from("users")
          .select("id, name")
          .in("id", userIds);
        if (usrErr) throw usrErr;
        for (const u of users ?? []) userMap.set(u.id, u.name);
      }

      setEntries(
        (rows ?? []).map((r) => ({
          id: r.id,
          event_type: r.event_type,
          target_table: r.target_table,
          target_record_id: r.target_record_id,
          actor_user_id: r.actor_user_id,
          actor_user_name: r.actor_user_id ? userMap.get(r.actor_user_id) ?? null : null,
          changes_summary: summariseChanges(r.event_type, r.changes),
          created_at: r.created_at,
        })),
      );
    } catch (e: any) {
      toast.error(`Failed to load activity log: ${e?.message ?? "Unknown error"}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [programmeId]);

  useEffect(() => {
    load();
  }, [load]);

  return { entries, loading, refresh: load };
}
