import { Circle, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleAnalysisProgress } from "@/hooks/useAnalysis";

interface AnalysisRoleProgressBoxProps {
  progress: RoleAnalysisProgress;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
}

const AnalysisRoleProgressBox = ({ progress, isActive, isExpanded, onClick }: AnalysisRoleProgressBoxProps) => {
  const isClickable =
    progress.status === "complete" ||
    progress.status === "error" ||
    progress.status === "analyzing";

  // Counts for the bottom line
  const analyzedCount = progress.actors.filter((a) => a.status === "complete").length;
  const referenceCount = progress.actors.filter((a) => a.status === "skipped").length;

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      title={progress.role_name}
      className={cn(
        "flex flex-col items-center gap-1.5 px-3 py-3 rounded-card border transition-all flex-1 min-w-0 basis-0",
        isExpanded && "border-border-accent shadow-glow",
        isActive && !isExpanded && "border-border-accent",
        progress.status === "waiting" && "border-border bg-surface",
        progress.status === "analyzing" && !isExpanded && "border-accent-teal/50 bg-surface",
        progress.status === "complete" && !isExpanded && "border-accent-teal/30 bg-surface cursor-pointer hover:bg-elevated/50",
        progress.status === "error" && "border-destructive/40 bg-surface",
      )}
      disabled={!isClickable}
    >
      {/* Status icon */}
      {progress.status === "waiting" && <Circle className="w-4 h-4 text-foreground-muted" />}
      {progress.status === "analyzing" && <Loader2 className="w-4 h-4 text-accent-teal animate-spin" />}
      {progress.status === "complete" && <Check className="w-4 h-4 text-accent-teal" />}
      {progress.status === "error" && <X className="w-4 h-4 text-destructive" />}

      {/* Role name — same styling as Step 3 (line-clamp-3, balanced, break-words) */}
      <span
        className={cn(
          "text-caption font-medium leading-tight text-center line-clamp-3 [text-wrap:balance] break-words",
          progress.status === "waiting" ? "text-foreground-muted" : "text-foreground-secondary",
          (isActive || isExpanded) && "text-foreground",
        )}
      >
        {progress.role_name}
      </span>

      {/* Counts: progress + reference */}
      {(progress.status === "analyzing" || progress.status === "complete") && (
        <div className="flex items-center gap-1.5 text-mono-xs font-mono">
          <span className="text-foreground-muted">
            {progress.completed_actors}/{progress.total_actors}
          </span>
          {analyzedCount > 0 && (
            <>
              <span className="text-foreground-muted/40">·</span>
              <span className="text-accent-teal">{analyzedCount} ✓</span>
            </>
          )}
          {referenceCount > 0 && (
            <>
              <span className="text-foreground-muted/40">·</span>
              <span className="text-foreground-muted">{referenceCount} ref</span>
            </>
          )}
        </div>
      )}
    </button>
  );
};

export default AnalysisRoleProgressBox;
