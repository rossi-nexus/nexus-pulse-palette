import { useMemo, useState } from "react";
import { useProgrammeAuditLog } from "@/hooks/useProgrammeAuditLog";
import type { ProgrammeAuditEntry } from "@/types/analytics";

interface Props {
  programmeId: string;
}

const ACTION_LABELS: Record<string, string> = {
  mutation: "modified",
  suggest: "suggested for review",
  approve_and_verify: "approved and verified",
  reject_suggestion: "rejected",
  verify: "re-verified",
  promote: "promoted",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function formatDay(key: string): string {
  const d = new Date(key);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const ProgrammeAuditLogPanel = ({ programmeId }: Props) => {
  const { entries, loading } = useProgrammeAuditLog(programmeId);
  const [showAll, setShowAll] = useState(false);

  const groups = useMemo(() => {
    const visible = showAll ? entries : entries.slice(0, 25);
    const m = new Map<string, ProgrammeAuditEntry[]>();
    for (const e of visible) {
      const k = dayKey(e.created_at);
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return Array.from(m.entries());
  }, [entries, showAll]);

  return (
    <section className="space-y-3">
      <h2 className="text-h2 text-foreground">Activity log</h2>
      {loading ? (
        <p className="text-body-sm text-foreground-muted italic">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-body-sm text-foreground-muted italic">No activity recorded yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => (
            <div key={day} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-muted">
                {formatDay(day)}
              </div>
              {items.map((e) => {
                const action = ACTION_LABELS[e.event_type] ?? e.event_type;
                const who = e.actor_user_name ?? "Someone";
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2 text-body-sm"
                  >
                    <div className="min-w-0 flex-1 truncate">
                      <span className="text-foreground">{who}</span>{" "}
                      <span className="text-foreground-secondary">{action}</span>{" "}
                      <span className="font-mono text-foreground-muted text-xs">
                        {e.target_table}
                      </span>
                      {e.changes_summary && (
                        <span className="text-foreground-muted"> · {e.changes_summary}</span>
                      )}
                    </div>
                    <span className="text-foreground-muted text-xs shrink-0 ml-3">
                      {timeAgo(e.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {!showAll && entries.length > 25 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-accent-teal hover:underline text-body-sm"
            >
              Show all ({entries.length})
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default ProgrammeAuditLogPanel;
