import { Radio, Filter } from "lucide-react";
import AtmosphereLayer from "@/components/nexus/AtmosphereLayer";

const SKELETON = [
  { tag: "Domain · Maritime", title: "—", meta: "—" },
  { tag: "Domain · C-UAS", title: "—", meta: "—" },
  { tag: "Domain · ISR", title: "—", meta: "—" },
];

const FILTERS = ["All", "Maritime", "Land", "Air", "Cyber", "C-UAS"];

const IntelligencePage = () => {
  return (
    <AtmosphereLayer variant="empty" className="h-full">
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          <header className="flex items-center gap-3 mb-2">
            <Radio className="w-5 h-5 text-accent-teal" />
            <h1 className="text-h2 text-foreground">Intelligence</h1>
            <span className="ml-2 text-[10px] uppercase tracking-[0.18em] font-medium px-2 py-0.5 rounded bg-elevated border border-border text-foreground-muted">
              Dormant
            </span>
          </header>
          <p className="text-body-sm text-foreground-secondary mb-6 max-w-2xl">
            Domain intelligence feed — activates in a later phase. When live, this surface
            will stream verified-source signals tied to your programmes and verified actors.
          </p>

          <div className="flex items-center gap-2 mb-8 opacity-50 pointer-events-none">
            <Filter className="w-3.5 h-3.5 text-foreground-muted" />
            {FILTERS.map((f, i) => (
              <span
                key={f}
                className={`text-[11px] px-3 py-1 rounded-full border ${
                  i === 0
                    ? "border-border-accent/40 bg-elevated text-foreground"
                    : "border-border bg-surface text-foreground-muted"
                }`}
              >
                {f}
              </span>
            ))}
          </div>

          <div className="space-y-3">
            {SKELETON.map((s, i) => (
              <div
                key={i}
                className="rounded-card border border-border bg-surface/70 px-5 py-4"
              >
                <div className="text-[10px] uppercase tracking-[0.15em] text-foreground-muted font-medium mb-2">
                  {s.tag}
                </div>
                <div className="h-3 w-3/4 rounded bg-elevated mb-2.5" />
                <div className="h-2.5 w-1/2 rounded bg-elevated/70 mb-1.5" />
                <div className="h-2.5 w-1/3 rounded bg-elevated/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AtmosphereLayer>
  );
};

export default IntelligencePage;
