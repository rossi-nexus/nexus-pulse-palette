import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { computeVerifiedBadgeState } from "@/lib/computeVerifiedBadgeState";
import type { VerifiedBadgeState } from "@/types/verification";

interface Props {
  verifiedAt: string | null | undefined;
  decaysAt: string | null | undefined;
  size?: "sm" | "md";
  /** When false, only icon + aria-label are rendered (compact card layouts). */
  showLabel?: boolean;
  className?: string;
}

interface StateConfig {
  label: string;
  Icon: typeof CheckCircle2;
  cls: string;
}

const STATE: Record<VerifiedBadgeState, StateConfig> = {
  unverified: {
    label: "Unverified",
    Icon: Circle,
    cls: "text-foreground-muted",
  },
  verified_fresh: {
    label: "Verified",
    Icon: CheckCircle2,
    cls: "text-success",
  },
  decay_warning: {
    label: "Verification expires soon",
    Icon: Clock,
    cls: "text-warning",
  },
  expired: {
    label: "Verification expired",
    Icon: XCircle,
    cls: "text-destructive",
  },
};

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

const VerifiedStatusBadge = ({
  verifiedAt,
  decaysAt,
  size = "sm",
  showLabel = true,
  className,
}: Props) => {
  const state = computeVerifiedBadgeState(verifiedAt, decaysAt);
  const cfg = STATE[state];
  const Icon = cfg.Icon;

  const iconSize = size === "md" ? "w-4 h-4" : "w-3 h-3";
  const textSize = size === "md" ? "text-xs" : "text-[10px]";

  let tipText: string | null = null;
  if (state === "decay_warning" && decaysAt) {
    tipText = `Decays in ${Math.max(0, daysFromNow(decaysAt))} days`;
  } else if (state === "expired" && decaysAt) {
    tipText = `Expired ${new Date(decaysAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;
  }

  const inner = (
    <span
      aria-label={cfg.label}
      className={cn(
        "inline-flex items-center gap-1 font-medium uppercase tracking-wider",
        cfg.cls,
        textSize,
        className,
      )}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {showLabel && <span>{cfg.label}</span>}
    </span>
  );

  if (!tipText) return inner;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{inner}</span>
        </TooltipTrigger>
        <TooltipContent>{tipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default VerifiedStatusBadge;
