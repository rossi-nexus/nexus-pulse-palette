// Phase 6.5.6: shared outcome history list (used on ActorProfile + ProgrammeView).
import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OUTCOME_LABEL,
  type OutcomeType,
  type ProgrammeOutcomeWithContext,
} from "@/types/outcome";

const OUTCOME_CHIP: Record<OutcomeType, string> = {
  delivered: "bg-success/15 text-success border-success/30",
  contracted: "bg-info/15 text-info border-info/30",
  engaged: "bg-foreground/10 text-foreground-secondary border-border",
  declined: "bg-foreground/10 text-foreground-muted border-border",
  disappointed: "bg-destructive/15 text-destructive border-destructive/30",
};

interface Props {
  outcomes: ProgrammeOutcomeWithContext[];
  /** "actor" → on actor profile, hide actor name (implicit). "programme" → on programme view, hide programme name. */
  variant: "actor" | "programme";
  emptyState?: React.ReactNode;
}

function fmt(s: string | null) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

export const OutcomeHistoryList = ({ outcomes, variant, emptyState }: Props) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (outcomes.length === 0) {
    return (
      <div className="text-body-sm text-foreground-muted italic">
        {emptyState ?? "No outcomes recorded yet."}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {outcomes.map((o) => {
        const isOpen = expanded === o.id;
        const hasDetails = !!o.notes || (o.evidence && o.evidence.length > 0);
        return (
          <div
            key={o.id}
            className="bg-surface border border-border rounded-md px-3 py-2 space-y-1.5"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border uppercase tracking-wide",
                    OUTCOME_CHIP[o.outcome_type],
                  )}
                >
                  {OUTCOME_LABEL[o.outcome_type]}
                </span>
                {variant === "programme" && (
                  <span className="text-body text-foreground truncate">
                    {o.actor_name}
                  </span>
                )}
                {variant === "actor" && (
                  <span className="text-body text-foreground-secondary truncate">
                    on {o.programme_name}
                  </span>
                )}
                {o.evidence?.length > 0 && (
                  <span className="inline-flex items-center text-xs text-foreground-muted">
                    {o.evidence.length} source{o.evidence.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground-muted">
                <span>
                  {o.recorded_by_name ?? "Unknown"} · {fmt(o.recorded_at)}
                </span>
                {o.completed_at && <span>· completed {fmt(o.completed_at)}</span>}
                {hasDetails && (
                  <button
                    onClick={() => setExpanded(isOpen ? null : o.id)}
                    className="hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>
            </div>
            {isOpen && hasDetails && (
              <div className="pt-1.5 border-t border-border space-y-1.5">
                {o.notes && (
                  <p className="text-body-sm text-foreground-secondary whitespace-pre-wrap">
                    {o.notes}
                  </p>
                )}
                {o.evidence?.length > 0 && (
                  <ul className="space-y-1">
                    {o.evidence.map((e, i) => (
                      <li
                        key={i}
                        className="text-xs text-foreground-muted flex items-start gap-1.5"
                      >
                        {e.source_url ? (
                          <a
                            href={e.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-teal hover:underline inline-flex items-center gap-1"
                          >
                            {e.source_url.replace(/^https?:\/\//, "").split("/")[0]}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : null}
                        {e.note && <span>— {e.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
