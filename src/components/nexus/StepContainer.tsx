import { useState } from "react";
import { ChevronDown, Lock, Pencil, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "not_started" | "editing" | "locked";

interface StepContainerProps {
  stepNumber?: number;
  title: string;
  status: StepStatus;
  isSpecial?: boolean;
  isActive?: boolean;
  summaryLine?: string;
  children?: React.ReactNode;
}

const statusConfig: Record<StepStatus, { label: string; icon: typeof Circle; colorClass: string }> = {
  not_started: { label: "Not started", icon: Circle, colorClass: "text-foreground-muted" },
  editing: { label: "Editing", icon: Pencil, colorClass: "text-accent-teal" },
  locked: { label: "Locked", icon: Lock, colorClass: "text-accent-teal" },
};

const StepContainer = ({ stepNumber, title, status, isSpecial, isActive, summaryLine, children }: StepContainerProps) => {
  const isLocked = status === "locked";
  const isEditing = status === "editing";
  const [isOpen, setIsOpen] = useState(!isLocked || !!children);

  const { label, icon: StatusIcon, colorClass } = statusConfig[status];

  const hasContent = !!children;

  return (
    <div
      className={cn(
        "bg-surface border rounded-card transition-all duration-200",
        isActive ? "border-border-accent shadow-glow" : isLocked ? "border-border-accent/40" : "border-border",
      )}
    >
      {/* Header */}
      <button
        onClick={() => {
          if (!hasContent && !isLocked) setIsOpen(!isOpen);
          if (hasContent && !isLocked) setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full flex items-center justify-between px-6 py-4 text-left transition-colors",
          !isLocked && "hover:bg-elevated/50 cursor-pointer",
          isLocked && !hasContent && "cursor-default"
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-mono-xs font-mono shrink-0 border transition-colors",
              isActive || isLocked
                ? "bg-gradient-accent-subtle border-border-accent text-accent-teal"
                : "bg-elevated border-border text-foreground-muted"
            )}
          >
            {isSpecial ? "·" : stepNumber}
          </div>

          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "text-body-sm font-medium",
                isActive || isLocked ? "text-foreground" : "text-foreground-secondary"
              )}
            >
              {title}
            </span>

            {isLocked && summaryLine && !hasContent && (
              <span className="text-caption text-foreground-muted">{summaryLine}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn("flex items-center gap-1.5", colorClass)}>
            <StatusIcon className="w-3 h-3" />
            <span className="text-mono-xs font-mono uppercase tracking-wider">{label}</span>
          </div>

          {(!isLocked || hasContent) && (
            <ChevronDown
              className={cn(
                "w-4 h-4 text-foreground-muted transition-transform duration-200",
                isOpen && "rotate-180"
              )}
            />
          )}
        </div>
      </button>

      {/* Content area */}
      {isOpen && (
        <div className="px-6 pb-6">
          <div className="border-t border-border-subtle pt-6">
            {hasContent ? (
              children
            ) : (
              <div className="min-h-[120px] rounded bg-elevated/30 border border-dashed border-border flex items-center justify-center">
                <span className="text-caption text-foreground-muted select-none" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StepContainer;
