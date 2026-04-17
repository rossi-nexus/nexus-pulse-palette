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
  const isClickable = progress.status === "complete" || progress.status === "error" || progress.status === "analyzing";

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      className={cn(
        "flex flex-col items-center gap-1.5 px-4 py-3 rounded-card border transition-all min-w-[140px] shrink-0",
        isExpanded && "border-border-accent shadow-glow",
        isActive && !isExpanded && "border-border-accent",
        progress.status === "waiting" && "border-border bg-surface",
        progress.status === "analyzing" && !isExpanded && "border-accent-teal/50 bg-surface",
        progress.status === "complete" && !isExpanded && "border-accent-teal/30 bg-surface cursor-pointer hover:bg-elevated/50",
        progress.status === "error" && "border-destructive/40 bg-surface",
      )}
      disabled={!isClickable}
    >
      {progress.status === "waiting" && <Circle className="w-4 h-4 text-foreground-muted" />}
      {progress.status === "analyzing" && <Loader2 className="w-4 h-4 text-accent-teal animate-spin" />}
      {progress.status === "complete" && <Check className="w-4 h-4 text-accent-teal" />}
      {progress.status === "error" && <X className="w-4 h-4 text-destructive" />}

      <span className={cn(
        "text-caption font-medium truncate max-w-[120px]",
        progress.status === "waiting" ? "text-foreground-muted" : "text-foreground-secondary",
        (isActive || isExpanded) && "text-foreground",
      )}>
        {progress.role_name}
      </span>

      <span className="text-mono-xs font-mono text-foreground-muted">
        {progress.completed_actors}/{progress.total_actors} done
      </span>
    </button>
  );
};

export default AnalysisRoleProgressBox;
