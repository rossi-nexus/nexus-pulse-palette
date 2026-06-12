import { Circle, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleSearchResult } from "@/hooks/useSearch";

interface RoleProgressBoxProps {
  result: RoleSearchResult;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
  /** SX-04 — flagged stale by Axis after constraints rescoped this role. */
  stale?: boolean;
}

const RoleProgressBox = ({ result, isActive, isExpanded, onClick, stale = false }: RoleProgressBoxProps) => {
  const isClickable = result.status === "complete" || result.status === "error";
  const includedCount = result.actors.filter(a => a.triage_decision === "included").length;

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      title={result.role_name}
      className={cn(
        "relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-card border transition-all flex-1 min-w-0 basis-0",
        isExpanded && "border-border-accent shadow-glow",
        isActive && !isExpanded && "border-border-accent",
        result.status === "waiting" && "border-border bg-surface",
        result.status === "searching" && !isExpanded && "border-accent-teal/50 bg-surface",
        result.status === "complete" && !isExpanded && "border-accent-teal/30 bg-surface cursor-pointer hover:bg-elevated/50",
        result.status === "error" && "border-destructive/40 bg-surface",
        stale && "border-warning/60 bg-warning/5",
      )}
      disabled={!isClickable}
    >
      {stale && (
        <AlertTriangle className="absolute top-1.5 right-1.5 w-3 h-3 text-warning" />
      )}
      {/* Status icon */}
      {result.status === "waiting" && <Circle className="w-4 h-4 text-foreground-muted" />}
      {result.status === "searching" && <Loader2 className="w-4 h-4 text-accent-teal animate-spin" />}
      {result.status === "complete" && <Check className="w-4 h-4 text-accent-teal" />}
      {result.status === "error" && <X className="w-4 h-4 text-destructive" />}

      {/* Role name */}
      <span className={cn(
        "text-caption font-medium leading-tight text-center line-clamp-3 [text-wrap:balance] break-words",
        result.status === "waiting" ? "text-foreground-muted" : "text-foreground-secondary",
        (isActive || isExpanded) && "text-foreground",
      )}>
        {result.role_name}
      </span>

      {/* Counts: found + included + excluded */}
      {(result.status === "searching" || result.status === "complete") && (
        <div className="flex items-center gap-1.5 text-mono-xs font-mono">
          <span className="text-foreground-muted">{result.actors.length} found</span>
          {includedCount > 0 && (
            <>
              <span className="text-foreground-muted/40">·</span>
              <span className="text-accent-teal">{includedCount} ✓</span>
            </>
          )}
        </div>
      )}
      {(result.excluded_by_sourcing && result.excluded_by_sourcing > 0) ||
       (result.country_unverified_count && result.country_unverified_count > 0) ? (
        <div
          className="text-mono-xs font-mono text-warning text-center leading-tight"
          title={`Sourcing intent (${result.sourcing_intent ?? "intent"}): ${result.excluded_by_sourcing ?? 0} excluded · ${result.country_unverified_count ?? 0} country unverified`}
        >
          {result.excluded_by_sourcing ?? 0} excluded
          {result.country_unverified_count && result.country_unverified_count > 0 ? (
            <> · {result.country_unverified_count} unverified</>
          ) : null}
        </div>
      ) : null}
    </button>
  );
};

export default RoleProgressBox;

