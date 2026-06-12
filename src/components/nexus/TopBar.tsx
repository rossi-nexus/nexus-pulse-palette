import logo from "@/assets/logo_aexs.png";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, ShieldCheck, ListChecks, Clock4, Workflow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { StatusChip } from "./StatusChip";
import { useTopbarStatus } from "@/hooks/useTopbarStatus";
import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

const TopBar = () => {
  const { user, signOut, signingOut } = useAuth();
  const navigate = useNavigate();
  const initials = user?.email?.[0]?.toUpperCase() || "U";
  const status = useTopbarStatus();

  // Narrow-mode collapse for chips.
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 1100 : false,
  );
  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-16 border-b border-border bg-elevated flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="æXs" className="h-6" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.2)' }} />
          <div className="h-5 w-px bg-border" />
          <span className="text-sm uppercase tracking-[0.18em] font-medium text-foreground-muted select-none">
            NEXUS
          </span>
          <span className="text-body-sm text-foreground-secondary ml-1 select-none hidden lg:inline">
            Enable Access. Leverage Excess.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* VR-01 — situational chips */}
          {status.sessionStep !== null && (
            <StatusChip
              label="Step"
              value={`${status.sessionStep} / ${status.sessionTotal}`}
              accent="info"
              icon={<Workflow className="w-4 h-4" />}
              onClick={() => navigate("/pipeline")}
              tooltip="Active session step"
              collapsed={collapsed}
            />
          )}
          {status.verifiedActors !== null && (
            <StatusChip
              label="Verified"
              value={status.verifiedActors}
              icon={<ShieldCheck className="w-4 h-4" />}
              onClick={() => navigate("/actors")}
              tooltip="Verified actors visible to you"
              collapsed={collapsed}
            />
          )}
          {status.showPending && status.pendingVerification !== null && (
            <StatusChip
              label="Pending"
              value={status.pendingVerification}
              icon={<ListChecks className="w-4 h-4" />}
              onClick={() => navigate("/consultant/verification")}
              tooltip="Pending verification queue"
              collapsed={collapsed}
            />
          )}
          {status.decayLt30 !== null && status.decayLt30 > 0 && (
            <StatusChip
              label="Decay <30d"
              value={status.decayLt30}
              accent="warning"
              icon={<Clock4 className="w-4 h-4" />}
              onClick={() =>
                navigate(status.showPending ? "/consultant" : "/actors")
              }
              tooltip={`${status.decayLt30} verified records decay in the next 30 days`}
              collapsed={collapsed}
            />
          )}

          <div className="h-6 w-px bg-border mx-1" />
          <NotificationsBell />
          <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center">
            <span className="text-mono-xs font-mono font-medium text-foreground-muted">{initials}</span>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title={signingOut ? "Signing out…" : "Sign out"}
          >
            <LogOut className="w-4 h-4" />
            {signingOut && <span className="text-xs">Signing out…</span>}
          </button>
        </div>
      </header>
    </TooltipProvider>
  );
};

export default TopBar;
