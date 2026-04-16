import logo from "@/assets/logo_aexs.png";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

const TopBar = () => {
  const { user, signOut } = useAuth();
  const initials = user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="h-16 border-b border-border bg-elevated flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <img src={logo} alt="æXs" className="h-6" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.2)' }} />
        <div className="h-5 w-px bg-border" />
        <span className="text-label uppercase tracking-[0.18em] text-foreground-muted select-none">
          NEXUS
        </span>
        <span className="text-body-sm text-foreground-secondary ml-1 select-none">
          Enable Access. Leverage Excess.
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center">
          <span className="text-mono-xs font-mono text-foreground-muted">{initials}</span>
        </div>
        <button
          onClick={signOut}
          className="text-foreground-muted hover:text-foreground transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default TopBar;
