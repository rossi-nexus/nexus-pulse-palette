import { useEffect, useRef, useState } from "react";
import { Check, Bookmark, Undo2, ExternalLink, ArrowRightLeft, ChevronDown, GitCompare, MoreHorizontal, Flag, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import VerifiedStatusBadge from "@/components/nexus/VerifiedStatusBadge";
import { RecordOutcomeDialog } from "@/components/outcome/RecordOutcomeDialog";
import HelpHint from "@/components/ui/HelpHint";
import { cn } from "@/lib/utils";
import { useTrackInteraction } from "@/hooks/useTrackInteraction";
import type { ActorCardData } from "@/hooks/useSearch";

interface ActorCardProps {
  actor: ActorCardData;
  roleId: string;
  onInclude: (roleId: string, actorId: string) => void;
  onSaveForLater: (roleId: string, actorId: string) => void;
  onUndo: (roleId: string, actorId: string) => void;
  /** AX3b — compare toggle */
  isCompareSelected?: boolean;
  onToggleCompare?: (actor: ActorCardData) => void;
  readOnly?: boolean;
  /** AX4 — session id for interaction tracking. */
  sessionId?: string | null;
  /** AX4 — called after an outcome is recorded so the row can re-score. */
  onOutcomeRecorded?: (actorId: string) => void;
}

const strengthConfig = {
  strong: { label: "Strong", className: "bg-success/10 text-success border-success/20" },
  moderate: { label: "Moderate", className: "bg-warning/10 text-warning border-warning/20" },
  weak: { label: "Weak", className: "bg-foreground-muted/10 text-foreground-muted border-foreground-muted/20" },
};

// AX3b — tier-coloured score badge
function scoreTone(s: number): string {
  if (s >= 0.8) return "border-accent-teal/40 text-accent-teal bg-accent-teal/10";
  if (s >= 0.5) return "border-warning/40 text-warning bg-warning/10";
  return "border-foreground-muted/30 text-foreground-muted bg-foreground-muted/10";
}

interface AxisRow {
  key: string;
  label: string;
  score: number;
  weight: number;
  contrib: number;
  detail: string | null;
}

function buildAxisRows(breakdown: any): AxisRow[] {
  if (!breakdown || typeof breakdown !== "object") return [];
  const out: AxisRow[] = [];
  const order = ["ontology", "geography", "outcome", "decay", "capacity", "certification", "group_rollup", "engagement"];
  for (const key of order) {
    const a = breakdown[key];
    if (!a || typeof a !== "object") continue;
    let detail: string | null = null;
    if (key === "ontology") {
      const m = Array.isArray(a.matched_tags) ? a.matched_tags.length : 0;
      const i = Array.isArray(a.inherited_tags) ? a.inherited_tags.length : 0;
      detail = `${m} matched${i > 0 ? ` · ${i} inherited` : ""}`;
    } else if (key === "geography") {
      detail = a.filter ?? (a.distance_km != null ? `${Math.round(a.distance_km)}km` : "no constraint");
    } else if (key === "outcome") {
      detail = `${a.outcome_count ?? 0} outcomes · mod ${a.modifier ?? "—"}`;
    } else if (key === "decay") {
      detail = a.verified_at ? `verified ${new Date(a.verified_at).toLocaleDateString()}` : "unverified";
    } else if (key === "capacity") {
      const sig = Array.isArray(a.matched_signals) ? a.matched_signals : [];
      detail = sig.length > 0 ? sig.join("; ") : "no constraint";
    } else if (key === "certification") {
      const m = Array.isArray(a.matched) ? a.matched : [];
      const miss = Array.isArray(a.missing) ? a.missing : [];
      detail = m.length === 0 && miss.length === 0 ? "no constraint" : `matched ${m.join(", ") || "—"}${miss.length ? ` · missing ${miss.join(", ")}` : ""}`;
    } else if (key === "group_rollup") {
      detail = a.via_parent ? `via ${a.via_parent} (${a.inherited_count ?? 0} tags)` : null;
      if (!detail) continue;
    } else if (key === "engagement") {
      const n = a.interaction_count ?? 0;
      if (n === 0 && (a.score ?? 0) === 0) continue;
      const i = a.interactions || {};
      const parts: string[] = [];
      if (i.included) parts.push(`${i.included} included`);
      if (i.saved_for_later) parts.push(`${i.saved_for_later} saved`);
      if (i.profile_opened) parts.push(`${i.profile_opened} opened`);
      if (i.result_viewed) parts.push(`${i.result_viewed} viewed`);
      detail = parts.length ? parts.join(" · ") : `${n} interactions`;
    }
    out.push({
      key,
      label: key === "group_rollup" ? "Group rollup" : key === "engagement" ? "Your engagement" : key.charAt(0).toUpperCase() + key.slice(1),
      score: Number(a.score) || 0,
      weight: Number(a.weight) || 0,
      contrib: Number(a.contrib) || 0,
      detail,
    });
  }
  return out;
}

function topAxisChips(breakdown: any, max = 3): { label: string; key: string }[] {
  const rows = buildAxisRows(breakdown)
    .filter((r) => r.contrib > 0)
    .sort((a, b) => b.contrib - a.contrib)
    .slice(0, max);
  return rows.map((r) => {
    if (r.key === "ontology" && r.detail) return { key: r.key, label: r.detail.split(" ")[0] + " tags" };
    if (r.key === "geography" && r.detail && r.detail !== "no constraint") return { key: r.key, label: r.detail };
    if (r.key === "certification" && r.detail && r.detail !== "no constraint") {
      const m = breakdown.certification?.matched;
      if (Array.isArray(m) && m.length) return { key: r.key, label: m[0] };
    }
    if (r.key === "capacity" && r.detail && r.detail !== "no constraint") return { key: r.key, label: r.detail.split(" ")[0] };
    return { key: r.key, label: r.label };
  });
}

const ActorCard = ({
  actor, roleId, onInclude, onSaveForLater, onUndo,
  isCompareSelected, onToggleCompare, readOnly = false,
  sessionId = null, onOutcomeRecorded,
}: ActorCardProps) => {
  const [open, setOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const track = useTrackInteraction(sessionId);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);

  const strength = strengthConfig[actor.match_strength] || strengthConfig.moderate;
  const hasDecision = actor.triage_decision !== undefined;
  const breakdown: any = actor.relevance_breakdown ?? null;
  const score = typeof actor.relevance_score === "number" ? actor.relevance_score : null;
  const axisRows = buildAxisRows(breakdown);
  const chips = topAxisChips(breakdown);

  const trackableId = actor.db_actor_id || actor.id;
  const profileHref = actor.db_actor_id ? `/actors/${actor.db_actor_id}` : null;

  // AX4 — result_viewed once per card per mount (which is effectively per-session
  // since result lists are remounted on new searches).
  useEffect(() => {
    if (readOnly || !cardRef.current || viewedRef.current) return;
    const el = cardRef.current;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !viewedRef.current) {
          viewedRef.current = true;
          track(trackableId, "result_viewed", {
            role_id: roleId,
            total_score: score,
          });
          obs.disconnect();
          break;
        }
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackableId, readOnly]);

  // AX4 — compared event when entering the compare set.
  const prevCompare = useRef(isCompareSelected);
  useEffect(() => {
    if (!prevCompare.current && isCompareSelected) {
      track(trackableId, "compared", { role_id: roleId });
    }
    prevCompare.current = isCompareSelected;
  }, [isCompareSelected, trackableId, roleId, track]);

  const handleProfileOpen = () => {
    track(trackableId, "profile_opened", { role_id: roleId, total_score: score });
  };

  return (
    <div ref={cardRef} className={cn(
      "border rounded-card bg-surface p-4 space-y-3 transition-all border-l-4",
      !hasDecision && "border-border border-l-border",
      actor.triage_decision === "included" &&
        "border-accent-teal/40 border-l-accent-teal bg-accent-teal/5 shadow-[0_0_0_1px_hsl(var(--accent-teal)/0.15)]",
      actor.triage_decision === "saved_for_later" &&
        "border-foreground-muted/30 border-l-foreground-muted/40 opacity-70",
      isCompareSelected && "ring-2 ring-accent-blue/50",
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {profileHref ? (
              <Link
                to={profileHref}
                onClick={handleProfileOpen}
                className="text-body font-medium text-foreground hover:text-accent-teal transition-colors"
              >
                {actor.name}
              </Link>
            ) : (
              <h4 className="text-body font-medium text-foreground">{actor.name}</h4>
            )}
            {score !== null && (
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0 h-4 rounded-sharp font-mono", scoreTone(score))}
                title={`Relevance ${score.toFixed(2)}`}
              >
                {score.toFixed(2)}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 rounded-sharp", strength.className)}>
              {strength.label}
            </Badge>
            {actor.cross_role && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-sharp border-accent-blue/40 text-accent-blue gap-1">
                <ArrowRightLeft className="w-2.5 h-2.5" />
                Multi-role
                {typeof actor.cross_role_score === "number" && (
                  <span className="font-mono opacity-80">{actor.cross_role_score.toFixed(1)}</span>
                )}
              </Badge>
            )}
            {actor.matched_verified_at && (
              <VerifiedStatusBadge size="sm" verifiedAt={actor.matched_verified_at} decaysAt={actor.matched_decays_at} />
            )}
          </div>
          {(actor.location || actor.country) && (
            <p className="text-caption text-foreground-muted mt-0.5">
              {[actor.location, actor.country].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onToggleCompare && (
            <button
              type="button"
              onClick={() => onToggleCompare(actor)}
              className={cn(
                "p-1 rounded transition-colors",
                isCompareSelected
                  ? "bg-accent-blue/15 text-accent-blue"
                  : "text-foreground-muted hover:text-foreground-secondary hover:bg-elevated",
              )}
              title={isCompareSelected ? "Remove from compare" : "Add to compare"}
            >
              <GitCompare className="w-3.5 h-3.5" />
            </button>
          )}
          {actor.website && (
            <a href={actor.website} target="_blank" rel="noopener noreferrer"
               className="text-foreground-muted hover:text-foreground-secondary transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {!readOnly && actor.db_actor_id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1 rounded text-foreground-muted hover:text-foreground-secondary hover:bg-elevated transition-colors"
                  title="More actions"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {profileHref && (
                  <DropdownMenuItem asChild>
                    <Link to={profileHref} onClick={handleProfileOpen} className="gap-2">
                      <Eye className="w-3.5 h-3.5" /> Open profile
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setOutcomeOpen(true)} className="gap-2">
                  <Flag className="w-3.5 h-3.5" /> Record outcome…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* AX3b — top axis highlight chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.key} className="text-[10px] font-mono px-1.5 py-0.5 rounded-sharp bg-elevated text-foreground-secondary border border-border-subtle">
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      <p className="text-body-sm text-foreground-secondary">{actor.description}</p>

      {/* AX3b — Why matched expander */}
      {axisRows.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-caption text-foreground-muted hover:text-foreground-secondary transition-colors"
            >
              <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", open && "rotate-180")} />
              Why matched
              {score !== null && <span className="font-mono ml-1">· total {score.toFixed(2)}</span>}
            </button>
            <HelpHint>
              Each axis contributes <span className="font-mono">score × weight</span> to the total. Adjust weights in Settings → Ranking preferences to change how axes are balanced.
            </HelpHint>
          </div>
          <div className={cn("grid transition-all duration-200 ease-out", open ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <div className="space-y-1.5">
                {axisRows.sort((a, b) => b.contrib - a.contrib).map((r) => (
                  <div key={r.key} className="text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground-secondary">{r.label}</span>
                      <span className="font-mono text-foreground-muted">
                        {r.score.toFixed(2)} × {r.weight.toFixed(2)} = {r.contrib.toFixed(3)}
                      </span>
                    </div>
                    <div className="h-1 mt-0.5 bg-elevated rounded-sharp overflow-hidden">
                      <div className="h-full bg-accent-teal/60 transition-all duration-300" style={{ width: `${Math.min(100, r.score * 100)}%` }} />
                    </div>
                    {r.detail && <div className="text-foreground-muted mt-0.5">{r.detail}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Classification & Standards */}
      {(actor.classification_found || (actor.standards_found && actor.standards_found.length > 0)) && (
        <div className="flex flex-wrap gap-1.5">
          {actor.classification_found && (
            <Badge className="bg-info/10 text-info border border-info/20 text-[10px] px-1.5 py-0 h-4 rounded-sharp font-mono">
              {actor.classification_found}
            </Badge>
          )}
          {actor.standards_found?.map(std => (
            <Badge key={std} className="bg-surface text-foreground-muted border border-border text-[10px] px-1.5 py-0 h-4 rounded-sharp font-mono">
              {std}
            </Badge>
          ))}
        </div>
      )}

      {actor.evidence_snippets.length > 0 && (
        <div className="space-y-1">
          {actor.evidence_snippets.slice(0, 2).map((snippet, i) => (
            <p key={i} className="text-caption text-foreground-muted italic leading-relaxed">"{snippet}"</p>
          ))}
        </div>
      )}

      {actor.sources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {actor.sources.slice(0, 3).map((src, i) => (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
               className="text-mono-xs font-mono text-foreground-muted hover:text-foreground-secondary transition-colors truncate max-w-[200px]">
              {new URL(src.url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
        {readOnly ? (
          hasDecision && (
            <span className="text-mono-xs font-mono text-foreground-muted uppercase tracking-wider">
              {actor.triage_decision === "included" ? "✓ Included" : "⏳ Saved"}
            </span>
          )
        ) : !hasDecision ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onInclude(roleId, actor.id)}
              className="gap-1.5 text-accent-teal border-accent-teal/30 hover:bg-accent-teal/10 h-7 text-xs">
              <Check className="w-3 h-3" />
              Include in Step 4
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSaveForLater(roleId, actor.id)}
              className="gap-1.5 text-foreground-muted hover:text-foreground-secondary h-7 text-xs">
              <Bookmark className="w-3 h-3" />
              Save for later
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-mono-xs font-mono text-foreground-muted uppercase tracking-wider">
              {actor.triage_decision === "included" ? "✓ Included" : "⏳ Saved"}
            </span>
            <button onClick={() => onUndo(roleId, actor.id)}
              className="flex items-center gap-1 text-caption text-foreground-muted hover:text-foreground-secondary transition-colors">
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          </div>
        )}
      </div>

      {/* AX4 — Record outcome dialog */}
      {!readOnly && actor.db_actor_id && (
        <RecordOutcomeDialog
          open={outcomeOpen}
          onOpenChange={setOutcomeOpen}
          actorId={actor.db_actor_id}
          actorName={actor.name}
          onRecorded={() => onOutcomeRecorded?.(actor.id)}
        />
      )}
    </div>
  );
};

export default ActorCard;
