import { AlertTriangle, Info, XCircle, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalloutVariant = "info" | "warning" | "blocking";

interface Props {
  variant?: CalloutVariant;
  icon?: LucideIcon;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<
  CalloutVariant,
  { border: string; icon: string; defaultIcon: LucideIcon }
> = {
  info: {
    border: "border-l-accent-teal",
    icon: "text-accent-teal",
    defaultIcon: Info,
  },
  warning: {
    border: "border-l-warning",
    icon: "text-warning",
    defaultIcon: AlertTriangle,
  },
  blocking: {
    border: "border-l-destructive",
    icon: "text-destructive",
    defaultIcon: XCircle,
  },
};

const CalloutRow = ({ variant = "info", icon, children, action, className }: Props) => {
  const s = VARIANT_STYLES[variant];
  const Icon = icon ?? s.defaultIcon;
  return (
    <div
      className={cn(
        "flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-card bg-elevated/90 border border-border border-l-[4px] shadow-sm",
        s.border,
        className,
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", s.icon)} />
      <div className="flex-1 min-w-0 text-body-sm text-foreground">{children}</div>
      {action && <div className="shrink-0 flex items-center gap-1">{action}</div>}
    </div>
  );
};

export default CalloutRow;
