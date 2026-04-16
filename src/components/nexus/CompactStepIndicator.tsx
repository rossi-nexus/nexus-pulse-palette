import { Circle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "not_started" | "editing" | "locked";

interface CompactStepIndicatorProps {
  stepNumber?: number;
  title: string;
  status: StepStatus;
}

const CompactStepIndicator = ({ stepNumber, title, status }: CompactStepIndicatorProps) => {
  const isLocked = status === "locked";

  return (
    <div
      className={cn(
        "flex items-center justify-between px-6 py-3 rounded-card bg-surface border transition-colors",
        isLocked ? "border-border-accent/40" : "border-border"
      )}
    >
      <div className="flex items-center gap-3">
        {stepNumber && (
          <span className="text-mono-xs font-mono text-foreground-muted w-5 text-center">
            {stepNumber}
          </span>
        )}
        <span className="text-body-sm text-foreground-secondary">{title}</span>
      </div>
      <div className="flex items-center gap-1.5 text-foreground-muted">
        {isLocked ? (
          <>
            <Lock className="w-3 h-3 text-accent-teal" />
            <span className="text-mono-xs font-mono uppercase tracking-wider text-accent-teal">Locked</span>
          </>
        ) : (
          <>
            <Circle className="w-3 h-3" />
            <span className="text-mono-xs font-mono uppercase tracking-wider">Not started</span>
          </>
        )}
      </div>
    </div>
  );
};

export default CompactStepIndicator;
