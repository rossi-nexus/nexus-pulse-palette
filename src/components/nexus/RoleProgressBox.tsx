import { Circle, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleSearchResult } from "@/hooks/useSearch";

interface RoleProgressBoxProps {
  result: RoleSearchResult;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
}

const RoleProgressBox = ({ result, isActive, isExpanded, onClick }: RoleProgressBoxProps) => {
  const isClickable = result.status === "complete" || result.status === "error";
  const includedCount = result.actors.filter(a => a.triage_decision === "included").length;

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      title={result.role_name}
      className={cn(
        "flex flex-col items-center gap-1.5 px-4 py-3 rounded-card border transition-all min-w-[140px] max-w-[180px] shrink-0",
        isExpanded && "border-border-accent shadow-glow",
        isActive && !isExpanded && "border-border-accent",
        result.status === "waiting" && "border-border bg-surface",
        result.status === "searching" && !isExpanded && "border-accent-teal/50 bg-surface",
        result.status === "complete" && !isExpanded && "border-accent-teal/30 bg-surface cursor-pointer hover:bg-elevated/50",
        result.status === "error" && "border-destructive/40 bg-surface",
      )}
      disabled={!isClickable}
    >
      {/* Status icon */}
      {result.status === "waiting" && <Circle className="w-4 h-4 text-foreground-muted" />}
      {result.status === "searching" && <Loader2 className="w-4 h-4 text-accent-teal animate-spin" />}
      {result.status === "complete" && <Check className="w-4 h-4 text-accent-teal" />}
      {result.status === "error" && <X className="w-4 h-4 text-destructive" />}

      {/* Role name */}
      <span className={cn(
        "text-caption font-medium truncate max-w-[100px]",
        result.status === "waiting" ? "text-foreground-muted" : "text-foreground-secondary",
        (isActive || isExpanded) && "text-foreground",
      )}>
        {result.role_name}
      </span>

      {/* Counts: found + included */}
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
    </button>
  );
};

export default RoleProgressBox;
