// VR-01 — Dormant Intelligence feed surface. No data wiring. No network calls.
import { Radar, Filter } from "lucide-react";

const FILTERS = ["All signals", "Procurement", "Industry news", "Programme-linked"];

const SkeletonCard = ({ delay }: { delay: number }) => (
  <div
    className="rounded-lg border border-border bg-surface/60 p-4 opacity-60"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-center gap-2 mb-3">
      <div className="h-3 w-20 rounded bg-elevated" />
      <div className="h-3 w-16 rounded bg-elevated" />
      <div className="ml-auto h-3 w-14 rounded bg-elevated" />
    </div>
    <div className="h-4 w-3/4 rounded bg-elevated mb-2" />
    <div className="h-3 w-full rounded bg-elevated/70 mb-1.5" />
    <div className="h-3 w-5/6 rounded bg-elevated/70" />
  </div>
);

const IntelligencePage = () => {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Radar className="w-5 h-5 text-accent-teal" />
            <h1 className="text-h1 font-semibold tracking-tight">Intelligence</h1>
            <span className="ml-2 px-2 py-0.5 rounded-full border border-border text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
              Preview
            </span>
          </div>
          <p className="text-body-sm text-foreground-secondary max-w-2xl">
            Domain intelligence feed — activates in a later phase. This surface
            will track procurement announcements, industry news and signals
            relevant to your programmes.
          </p>
        </header>

        {/* Disabled filter pill row */}
        <div className="flex items-center gap-2 mb-6 opacity-50 pointer-events-none">
          <Filter className="w-3.5 h-3.5 text-foreground-muted" />
          {FILTERS.map((f, i) => (
            <span
              key={f}
              className={
                i === 0
                  ? "px-3 py-1 rounded-full text-xs font-medium bg-elevated border border-border text-foreground"
                  : "px-3 py-1 rounded-full text-xs font-medium border border-border text-foreground-muted"
              }
            >
              {f}
            </span>
          ))}
        </div>

        <div className="space-y-3 select-none">
          <SkeletonCard delay={0} />
          <SkeletonCard delay={80} />
          <SkeletonCard delay={160} />
        </div>

        <div className="mt-10 text-center text-body-sm text-foreground-muted">
          Coming in a later phase — no live signals yet.
        </div>
      </div>
    </div>
  );
};

export default IntelligencePage;
