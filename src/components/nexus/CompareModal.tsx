import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import type { ActorCardData } from "@/hooks/useSearch";

interface CompareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ActorCardData[];
  onInclude?: (actor: ActorCardData) => void;
  onSave?: (actor: ActorCardData) => void;
}

const AXES = ["ontology", "geography", "outcome", "decay", "capacity", "certification"];

function valueFor(b: any, axis: string): { score: number | null; detail: string } {
  if (!b) return { score: null, detail: "—" };
  const a = b[axis];
  if (!a) return { score: null, detail: "—" };
  const score = Number(a.score);
  let detail = "—";
  if (axis === "ontology") {
    const m = Array.isArray(a.matched_tags) ? a.matched_tags.length : 0;
    detail = `${m} tags`;
  } else if (axis === "geography") {
    detail = a.filter ?? (a.distance_km != null ? `${Math.round(a.distance_km)}km` : "—");
  } else if (axis === "outcome") {
    detail = `${a.outcome_count ?? 0} outcomes`;
  } else if (axis === "decay") {
    detail = a.verified_at ? new Date(a.verified_at).toLocaleDateString() : "unverified";
  } else if (axis === "capacity") {
    const sig = Array.isArray(a.matched_signals) ? a.matched_signals : [];
    detail = sig.length > 0 ? sig.join("; ") : "—";
  } else if (axis === "certification") {
    const m = Array.isArray(a.matched) ? a.matched : [];
    const miss = Array.isArray(a.missing) ? a.missing : [];
    detail = `${m.length}/${m.length + miss.length}`;
  }
  return { score: Number.isFinite(score) ? score : null, detail };
}

const CompareModal = ({ open, onOpenChange, items, onInclude, onSave }: CompareModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1440px] w-[95vw] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Compare {items.length} actors</DialogTitle>
        </DialogHeader>
        <div
          className="grid gap-4 mt-4"
          style={{ gridTemplateColumns: `160px repeat(${items.length}, minmax(0,1fr))` }}
        >
          <div />
          {items.map((a) => (
            <div key={a.id} className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-body font-medium text-foreground">{a.name}</h3>
                {a.website && (
                  <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-foreground-muted hover:text-foreground-secondary">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              {(a.location || a.country) && (
                <p className="text-caption text-foreground-muted">{[a.location, a.country].filter(Boolean).join(", ")}</p>
              )}
              <div className="flex items-center gap-1.5">
                {typeof a.relevance_score === "number" && (
                  <Badge variant="outline" className="text-[10px] font-mono border-accent-teal/40 text-accent-teal">
                    {a.relevance_score.toFixed(2)}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{a.match_strength}</Badge>
              </div>
            </div>
          ))}

          {/* Per-axis rows — highlight differences */}
          {AXES.map((axis) => {
            const vals = items.map((it) => valueFor(it.relevance_breakdown, axis));
            const scores = vals.map((v) => v.score);
            const best = Math.max(...scores.map((s) => (s == null ? -Infinity : s)));
            const allEqual = scores.every((s) => s === scores[0]);
            return (
              <>
                <div key={`${axis}-l`} className="text-caption text-foreground-muted uppercase tracking-wider self-center">{axis}</div>
                {vals.map((v, i) => (
                  <div
                    key={`${axis}-${i}`}
                    className={cn(
                      "text-body-sm p-2 rounded border",
                      allEqual
                        ? "border-border-subtle bg-surface"
                        : v.score === best && v.score !== null
                          ? "border-accent-teal/40 bg-accent-teal/5"
                          : "border-border-subtle bg-surface text-foreground-muted",
                    )}
                  >
                    <div className="font-mono text-[10px]">{v.score != null ? v.score.toFixed(2) : "—"}</div>
                    <div className="text-caption">{v.detail}</div>
                  </div>
                ))}
              </>
            );
          })}

          {/* Action row */}
          <div />
          {items.map((a) => (
            <div key={`act-${a.id}`} className="flex flex-wrap gap-1.5 pt-2 border-t border-border-subtle">
              {onInclude && <Button size="sm" variant="outline" onClick={() => onInclude(a)}>Include</Button>}
              {onSave && <Button size="sm" variant="ghost" onClick={() => onSave(a)}>Save</Button>}
              {a.db_actor_id && (
                <Button size="sm" variant="ghost" asChild>
                  <Link to={`/actors/${a.db_actor_id}`}>Open profile</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompareModal;
