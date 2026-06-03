// V3 Batch B — header pill that surfaces the viewer's role on this actor.
// Soft case with leading icon, per Tore's Q5 decision.
import { Shield, Briefcase, UserCheck, User, Glasses } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ViewerActorRole, ViewerActorRoleKind } from "@/hooks/useViewerActorRole";

const ICON: Record<ViewerActorRoleKind, React.ComponentType<{ className?: string }>> = {
  admin: Shield,
  consultant: Briefcase,
  owner: UserCheck,
  personal: User,
  reader: Glasses,
};

// Soft, role-tinted backgrounds. All tokens already exist in the design system.
const TONE: Record<ViewerActorRoleKind, string> = {
  admin: "bg-warning/10 text-warning border-warning/30",
  consultant: "bg-accent-blue/10 text-accent-blue border-accent-blue/30",
  owner: "bg-success/10 text-success border-success/30",
  personal: "bg-info/10 text-info border-info/30",
  reader: "bg-surface text-foreground-secondary border-border/60",
};

export function ViewerRoleBadge({ role }: { role: ViewerActorRole }) {
  const Icon = ICON[role.kind];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border",
              TONE[role.kind],
            )}
            aria-label={`Your role on this actor: ${role.label}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="font-medium">{role.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{role.description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
