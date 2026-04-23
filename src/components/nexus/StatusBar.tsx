import { Database, Bookmark } from "lucide-react";

interface StatusBarProps {
  found: number;
  included: number;
  savedForLater: number;
}

const StatusBar = ({ found, included, savedForLater }: StatusBarProps) => (
  <div className="h-10 border-t border-border bg-surface flex items-center justify-between px-6 shrink-0">
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5 text-foreground-secondary">
        <Database className="w-3 h-3" />
        <span className="text-mono-xs font-mono">
          <span className="text-foreground font-medium">{found}</span> found
        </span>
      </div>
      <div className="w-px h-4 bg-border" />
      <span className="text-mono-xs font-mono text-foreground-secondary">
        <span className="text-foreground font-medium">{included}</span> included
      </span>
      <div className="w-px h-4 bg-border" />
      <span className="text-mono-xs font-mono text-foreground-secondary">
        <span className="text-foreground font-medium">{savedForLater}</span> saved for later
      </span>
    </div>

    <button
      disabled={savedForLater === 0}
      className="flex items-center gap-1.5 text-mono-xs font-mono text-accent-teal hover:text-accent-teal hover:underline transition-colors disabled:cursor-default disabled:text-foreground-muted disabled:no-underline"
    >
      <Bookmark className="w-3 h-3" />
      View saved actors
    </button>
  </div>
);

export default StatusBar;
