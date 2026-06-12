import logo from "@/assets/logo_aexs.png";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import StatusChips from "./StatusChips";

const TopBar = () => {
  const { user, signOut, signingOut } = useAuth();
  const initials = user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="h-16 border-b border-border bg-elevated/85 backdrop-blur-md flex items-center justify-between px-6 shrink-0 relative z-10">
      <div className="flex items-center gap-3">
        <img src={logo} alt="æXs" className="h-6" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.2)' }} />
        <div className="h-5 w-px bg-border" />
        <span className="text-sm uppercase tracking-[0.18em] font-medium text-foreground-muted select-none">
          NEXUS
        </span>
        <span className="hidden xl:inline text-body-sm text-foreground-secondary ml-1 select-none">
          Enable Access. Leverage Excess.
        </span>
      </div>

      <div className="flex items-center gap-4">
        <StatusChips />
        <div className="h-7 w-px bg-border" />
        <NotificationsBell />
        <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center">
          <span className="text-mono-xs font-mono text-foreground-muted">{initials}</span>
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
  );
};

export default TopBar;
