import { Check, Bookmark, Undo2, ExternalLink, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActorCardData } from "@/hooks/useSearch";

interface ActorCardProps {
  actor: ActorCardData;
  roleId: string;
  onInclude: (roleId: string, actorId: string) => void;
  onSaveForLater: (roleId: string, actorId: string) => void;
  onUndo: (roleId: string, actorId: string) => void;
}

const strengthConfig = {
  strong: { label: "Strong", className: "bg-success/10 text-success border-success/20" },
  moderate: { label: "Moderate", className: "bg-warning/10 text-warning border-warning/20" },
  weak: { label: "Weak", className: "bg-foreground-muted/10 text-foreground-muted border-foreground-muted/20" },
};

const ActorCard = ({ actor, roleId, onInclude, onSaveForLater, onUndo }: ActorCardProps) => {
  const strength = strengthConfig[actor.match_strength] || strengthConfig.moderate;
  const hasDecision = actor.triage_decision !== undefined;

  return (
    <div className={cn(
      "border rounded-card bg-surface p-4 space-y-3 transition-all border-l-4",
      !hasDecision && "border-border border-l-border",
      actor.triage_decision === "included" &&
        "border-accent-teal/40 border-l-accent-teal bg-accent-teal/5 shadow-[0_0_0_1px_hsl(var(--accent-teal)/0.15)]",
      actor.triage_decision === "saved_for_later" &&
        "border-foreground-muted/30 border-l-foreground-muted/40 opacity-70",
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-body font-medium text-foreground">{actor.name}</h4>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 rounded-sharp", strength.className)}>
              {strength.label}
            </Badge>
            {actor.cross_role && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-sharp border-accent-blue/40 text-accent-blue gap-1">
                <ArrowRightLeft className="w-2.5 h-2.5" />
                Multi-role
              </Badge>
            )}
          </div>
          {(actor.location || actor.country) && (
            <p className="text-caption text-foreground-muted mt-0.5">
              {[actor.location, actor.country].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        {actor.website && (
          <a
            href={actor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground-muted hover:text-foreground-secondary transition-colors shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Description */}
      <p className="text-body-sm text-foreground-secondary">{actor.description}</p>

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

      {/* Evidence snippets */}
      {actor.evidence_snippets.length > 0 && (
        <div className="space-y-1">
          {actor.evidence_snippets.slice(0, 2).map((snippet, i) => (
            <p key={i} className="text-caption text-foreground-muted italic leading-relaxed">
              "{snippet}"
            </p>
          ))}
        </div>
      )}

      {/* Sources */}
      {actor.sources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {actor.sources.slice(0, 3).map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mono-xs font-mono text-foreground-muted hover:text-foreground-secondary transition-colors truncate max-w-[200px]"
            >
              {new URL(src.url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
        {!hasDecision ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onInclude(roleId, actor.id)}
              className="gap-1.5 text-accent-teal border-accent-teal/30 hover:bg-accent-teal/10 h-7 text-xs"
            >
              <Check className="w-3 h-3" />
              Include in Step 4
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSaveForLater(roleId, actor.id)}
              className="gap-1.5 text-foreground-muted hover:text-foreground-secondary h-7 text-xs"
            >
              <Bookmark className="w-3 h-3" />
              Save for later
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-mono-xs font-mono text-foreground-muted uppercase tracking-wider">
              {actor.triage_decision === "included" ? "✓ Included" : "⏳ Saved"}
            </span>
            <button
              onClick={() => onUndo(roleId, actor.id)}
              className="flex items-center gap-1 text-caption text-foreground-muted hover:text-foreground-secondary transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActorCard;
