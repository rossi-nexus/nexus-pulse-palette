// Profile Queue Part 2 / P5: admin-only Archived actors tab.
// Lists actors with verification_status='merged_into_other' + merged_into_id
// set. Joins the survivor's legal_name and the merging user from audit_log.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ArchivedRow {
  id: string;
  legal_name: string;
  country: string | null;
  merged_into_id: string;
  merged_at: string | null;
  survivor_name: string | null;
  merger_email: string | null;
}

export function ArchivedActorsTab() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ArchivedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: archived, error } = await supabase
        .from("actors")
        .select("id, legal_name, country, merged_into_id, merged_at")
        .eq("verification_status", "merged_into_other")
        .not("merged_into_id", "is", null)
        .order("merged_at", { ascending: false });
      if (error || !archived) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const survivorIds = Array.from(new Set(archived.map((a) => a.merged_into_id).filter(Boolean) as string[]));
      const sourceIds = archived.map((a) => a.id);

      const [{ data: survivors }, { data: audits }] = await Promise.all([
        survivorIds.length
          ? supabase.from("actors").select("id, legal_name").in("id", survivorIds)
          : Promise.resolve({ data: [] as Array<{ id: string; legal_name: string }> }),
        sourceIds.length
          ? supabase
              .from("audit_log")
              .select("target_record_id, actor_user_id, created_at, event_type")
              .in("target_record_id", sourceIds)
              .eq("event_type", "actor_merged")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as Array<{ target_record_id: string; actor_user_id: string; created_at: string; event_type: string }> }),
      ]);

      const survivorMap = new Map(((survivors ?? []) as Array<{ id: string; legal_name: string }>).map((s) => [s.id, s.legal_name]));
      const mergerByActor = new Map<string, string>();
      for (const a of (audits ?? []) as Array<{ target_record_id: string; actor_user_id: string }>) {
        if (a.actor_user_id && !mergerByActor.has(a.target_record_id)) {
          mergerByActor.set(a.target_record_id, a.actor_user_id);
        }
      }

      const userIds = Array.from(new Set(Array.from(mergerByActor.values())));
      const { data: usersRows } = userIds.length
        ? await supabase.from("users").select("id, email, name").in("id", userIds)
        : { data: [] as Array<{ id: string; email: string; name: string | null }> };
      const userMap = new Map(((usersRows ?? []) as Array<{ id: string; email: string; name: string | null }>).map((u) => [u.id, u.name || u.email]));

      const result: ArchivedRow[] = archived.map((a) => ({
        id: a.id,
        legal_name: a.legal_name,
        country: a.country,
        merged_into_id: a.merged_into_id!,
        merged_at: a.merged_at,
        survivor_name: survivorMap.get(a.merged_into_id!) ?? null,
        merger_email: userMap.get(mergerByActor.get(a.id) ?? "") ?? null,
      }));
      if (!cancelled) {
        setRows(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground-muted py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading archived actors…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-foreground-muted text-sm">
        No archived (merged) actors.
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-elevated text-xs uppercase tracking-wider text-foreground-muted">
          <tr>
            <th className="text-left p-3">Source actor</th>
            <th className="text-left p-3">Merged into</th>
            <th className="text-left p-3">Merged at</th>
            <th className="text-left p-3">Merger</th>
            <th className="text-left p-3">Country</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => navigate(`/actors/${r.id}`)}
              className="border-t border-border hover:bg-elevated/50 cursor-pointer"
            >
              <td className="p-3 text-foreground">
                {r.legal_name}
                <Badge variant="outline" className="ml-2 text-[10px] bg-warning/10 text-warning border-warning/30">
                  archived
                </Badge>
              </td>
              <td className="p-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/actors/${r.merged_into_id}`);
                  }}
                  className="text-accent-teal hover:underline"
                >
                  {r.survivor_name ?? "(unknown)"}
                </button>
              </td>
              <td className="p-3 text-foreground-secondary">
                {r.merged_at ? new Date(r.merged_at).toLocaleDateString() : "—"}
              </td>
              <td className="p-3 text-foreground-secondary">{r.merger_email ?? "—"}</td>
              <td className="p-3 text-foreground-secondary">{r.country ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
