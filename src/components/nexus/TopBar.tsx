import logo from "@/assets/logo_aexs.png";

const TopBar = () => (
  <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
    <div className="flex items-center gap-3">
      <img src={logo} alt="æXs" className="h-6" />
      <div className="h-5 w-px bg-border" />
      <span className="text-label uppercase tracking-[0.18em] text-foreground-muted select-none">
        NEXUS
      </span>
    </div>

    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-elevated border border-border flex items-center justify-center">
        <span className="text-mono-xs font-mono text-foreground-muted">U</span>
      </div>
    </div>
  </header>
);

export default TopBar;
