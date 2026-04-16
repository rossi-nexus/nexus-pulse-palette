import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

const LogoMark = () => (
  <svg viewBox="0 0 64 28" className="h-6" aria-label="æXs">
    <defs>
      <linearGradient id="ae-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="hsl(214 38% 50%)" />
        <stop offset="50%" stopColor="hsl(168 38% 50%)" />
        <stop offset="100%" stopColor="hsl(148 40% 49%)" />
      </linearGradient>
    </defs>
    <text
      x="0"
      y="22"
      fontFamily="Inter, system-ui, sans-serif"
      fontSize="24"
      fontWeight="600"
      fill="url(#ae-grad)"
    >
      æ
    </text>
    <text
      x="20"
      y="22"
      fontFamily="Inter, system-ui, sans-serif"
      fontSize="24"
      fontWeight="600"
      className="fill-foreground-secondary"
    >
      Xs
    </text>
  </svg>
);

const TopBar = () => {
  const { user, signOut } = useAuth();
  const initials = user?.email?.[0]?.toUpperCase() || "U";

  return (
    <header className="h-16 border-b border-border bg-elevated flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <LogoMark />
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
