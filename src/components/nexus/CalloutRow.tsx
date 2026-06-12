// VR-01 — Standardized callout row.
// Left-accent border, dark surface, single message + optional action.
import { cn } from "@/lib/utils";
import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import type { ReactNode } from "react";

export type CalloutVariant = "info" | "warning" | "blocking";

interface Props {
  variant?: CalloutVariant;
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const variantBorder: Record<CalloutVariant, string> = {
  info: "border-l-accent-teal bg-accent-teal/[0.06]",
  warning: "border-l-warning bg-warning/[0.06]",
  blocking: "border-l-destructive bg-destructive/[0.06]",
};

const variantIconColor: Record<CalloutVariant, string> = {
  info: "text-accent-teal",
  warning: "text-warning",
  blocking: "text-destructive",
};

const defaultIcon: Record<CalloutVariant, ReactNode> = {
  info: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  blocking: <AlertOctagon className="w-4 h-4" />,
};

export const CalloutRow = ({
  variant = "info",
  icon,
  title,
  children,
  action,
  className,
}: Props) => {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2 rounded-md border border-border bg-surface/60",
        "border-l-[4px]",
        variantBorder[variant],
        className,
      )}
    >
      <span className={cn("shrink-0 mt-0.5", variantIconColor[variant])}>
        {icon ?? defaultIcon[variant]}
      </span>
      <div className="flex-1 min-w-0 text-body-sm text-foreground">
        {title && <div className="font-medium text-foreground">{title}</div>}
        <div className={cn(title && "mt-0.5 text-foreground-secondary")}>{children}</div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-1">{action}</div>}
    </div>
  );
};

export default CalloutRow;
