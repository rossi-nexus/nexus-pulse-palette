// VR-01 — Compact topbar KPI chip.
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type StatusChipAccent = "default" | "info" | "warning";

interface Props {
  label: string;
  value: ReactNode;
  accent?: StatusChipAccent;
  icon?: ReactNode;
  onClick?: () => void;
  tooltip?: string;
  /** When true, only the icon is shown (narrow screens). */
  collapsed?: boolean;
}

const accentClasses: Record<StatusChipAccent, string> = {
  default: "border-border text-foreground",
  info: "border-accent-teal/40 text-foreground",
  warning: "border-warning/50 text-foreground",
};

const valueAccentClasses: Record<StatusChipAccent, string> = {
  default: "text-foreground",
  info: "text-accent-teal",
  warning: "text-warning",
};

export const StatusChip = ({
  label,
  value,
  accent = "default",
  icon,
  onClick,
  tooltip,
  collapsed = false,
}: Props) => {
  // Trigger count-flash on value change.
  const valueStr = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const prev = useRef(valueStr);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== valueStr) {
      prev.current = valueStr;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 420);
      return () => clearTimeout(t);
    }
  }, [valueStr]);

  const interactive = !!onClick;
  const body = collapsed ? (
    <span className={cn("flex items-center justify-center w-8 h-8 rounded-md border bg-surface/70", accentClasses[accent])}>
      {icon ?? <span className={cn("text-xs font-mono font-semibold", valueAccentClasses[accent])}>{value}</span>}
    </span>
  ) : (
    <span
      className={cn(
        "flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-md border bg-surface/70 min-w-[72px]",
        accentClasses[accent],
        interactive && "hover:bg-surface hover:border-border-accent/60 transition-colors cursor-pointer",
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.14em] font-medium text-foreground-muted leading-none">
        {label}
      </span>
      <span
        className={cn(
          "text-[15px] font-mono font-semibold leading-tight",
          valueAccentClasses[accent],
          flash && "nx-count-flash",
        )}
      >
        {value}
      </span>
    </span>
  );

  const trigger = interactive ? (
    <button type="button" onClick={onClick} aria-label={label} className="appearance-none">
      {body}
    </button>
  ) : (
    <span aria-label={label}>{body}</span>
  );

  if (tooltip || collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="bottom">
          {tooltip ?? `${label}: ${valueStr}`}
        </TooltipContent>
      </Tooltip>
    );
  }
  return trigger;
};

export default StatusChip;
