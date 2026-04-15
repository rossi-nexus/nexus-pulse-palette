import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logo from "@/assets/logo_aexs.png";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-16">
    <h2 className="text-label uppercase tracking-widest text-foreground-muted mb-6 border-b border-border pb-3">
      {title}
    </h2>
    {children}
  </section>
);

const Swatch = ({ label, className, textClass = "text-foreground" }: { label: string; className: string; textClass?: string }) => (
  <div className="flex flex-col items-center gap-2">
    <div className={`w-16 h-16 rounded-card border border-border ${className}`} />
    <span className={`text-mono-xs font-mono ${textClass}`}>{label}</span>
  </div>
);

const DesignSystem = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-8 py-16">
        {/* Header */}
        <header className="mb-20">
          <div className="flex items-center gap-4 mb-6">
            <img src={logo} alt="æXs" className="h-10" />
            <div className="h-6 w-px bg-border" />
            <span className="text-label uppercase tracking-[0.2em] text-foreground-muted">NEXUS Design System</span>
          </div>
          <div className="h-1 w-32 bg-gradient-accent rounded-full" />
        </header>

        {/* Colors — Backgrounds */}
        <Section title="Color Palette — Backgrounds">
          <div className="flex gap-6 flex-wrap">
            <Swatch label="Base" className="bg-background" />
            <Swatch label="Surface" className="bg-surface" />
            <Swatch label="Elevated" className="bg-elevated" />
          </div>
        </Section>

        {/* Colors — Text */}
        <Section title="Color Palette — Text">
          <div className="flex gap-8 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-body text-foreground">Primary text</span>
              <span className="text-mono-xs font-mono text-foreground-muted">foreground</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-body text-foreground-secondary">Secondary text</span>
              <span className="text-mono-xs font-mono text-foreground-muted">foreground-secondary</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-body text-foreground-muted">Muted text</span>
              <span className="text-mono-xs font-mono text-foreground-muted">foreground-muted</span>
            </div>
          </div>
        </Section>

        {/* Colors — Accent Gradient */}
        <Section title="Color Palette — Accent Gradient">
          <div className="flex gap-6 flex-wrap items-start">
            <Swatch label="Blue" className="bg-accent-blue" />
            <Swatch label="Teal" className="bg-accent-teal" />
            <Swatch label="Green" className="bg-accent-green" />
            <div className="flex flex-col items-center gap-2">
              <div className="w-32 h-16 rounded-card bg-gradient-accent" />
              <span className="text-mono-xs font-mono text-foreground-muted">gradient-accent</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-32 h-16 rounded-card bg-gradient-accent-subtle border border-border" />
              <span className="text-mono-xs font-mono text-foreground-muted">gradient-subtle</span>
            </div>
          </div>
          <p className="text-gradient-accent text-h3 mt-6 font-semibold">Gradient text sample</p>
        </Section>

        {/* Colors — Semantic */}
        <Section title="Color Palette — Semantic States">
          <div className="flex gap-6 flex-wrap">
            <Swatch label="Success" className="bg-success" />
            <Swatch label="Warning" className="bg-warning" />
            <Swatch label="Destructive" className="bg-destructive" />
            <Swatch label="Info" className="bg-info" />
          </div>
        </Section>

        {/* Colors — Borders */}
        <Section title="Color Palette — Borders">
          <div className="flex gap-6 flex-wrap">
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-card border-2 border-border" />
              <span className="text-mono-xs font-mono text-foreground-muted">border</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-card border-2 border-border-subtle" />
              <span className="text-mono-xs font-mono text-foreground-muted">border-subtle</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-card border-2 border-border-accent" />
              <span className="text-mono-xs font-mono text-foreground-muted">border-accent</span>
            </div>
          </div>
        </Section>

        {/* Typography */}
        <Section title="Typography Scale">
          <div className="space-y-5 bg-surface rounded-card p-8 border border-border">
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">display</span>
              <span className="text-display">Display heading</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">h1</span>
              <span className="text-h1">Heading one</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">h2</span>
              <span className="text-h2">Heading two</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">h3</span>
              <span className="text-h3">Heading three</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">h4</span>
              <span className="text-h4">Heading four</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">body</span>
              <span className="text-body">Body text for primary content</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">body-sm</span>
              <span className="text-body-sm">Smaller body text for descriptions</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">caption</span>
              <span className="text-caption text-foreground-secondary">Caption and supplementary text</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">label</span>
              <span className="text-label uppercase tracking-widest text-foreground-secondary">Section label</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-mono-xs font-mono text-foreground-muted w-20 shrink-0">mono</span>
              <span className="text-mono-sm font-mono">0x4F · 128 · ACTIVE</span>
            </div>
          </div>
        </Section>

        {/* Spacing */}
        <Section title="Spacing Scale">
          <div className="flex items-end gap-6 flex-wrap">
            {[
              { name: "xs", size: "0.25rem" },
              { name: "sm", size: "0.5rem" },
              { name: "md", size: "1rem" },
              { name: "lg", size: "1.5rem" },
              { name: "xl", size: "2rem" },
              { name: "2xl", size: "3rem" },
              { name: "3xl", size: "4rem" },
            ].map(s => (
              <div key={s.name} className="flex flex-col items-center gap-2">
                <div className="bg-accent-teal/30 border border-accent-teal/50" style={{ width: s.size, height: "3rem" }} />
                <span className="text-mono-xs font-mono text-foreground-muted">{s.name}</span>
                <span className="text-mono-xs font-mono text-foreground-muted">{s.size}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Border Radius */}
        <Section title="Border Radius">
          <div className="flex gap-6 flex-wrap">
            {[
              { name: "sharp", cls: "rounded-sharp" },
              { name: "default", cls: "rounded" },
              { name: "card", cls: "rounded-card" },
              { name: "full", cls: "rounded-full" },
            ].map(r => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div className={`w-16 h-16 bg-elevated border border-border ${r.cls}`} />
                <span className="text-mono-xs font-mono text-foreground-muted">{r.name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons">
          <div className="space-y-6">
            <div className="flex gap-4 items-center flex-wrap">
              <Button>Primary action</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex gap-4 items-center flex-wrap">
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>
        </Section>

        {/* Cards */}
        <Section title="Cards">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface border border-border rounded-card p-6">
              <span className="text-label uppercase tracking-widest text-foreground-muted">Surface card</span>
              <p className="text-body-sm text-foreground-secondary mt-3">Standard container for grouped content on surface background.</p>
            </div>
            <div className="bg-elevated border border-border rounded-card p-6">
              <span className="text-label uppercase tracking-widest text-foreground-muted">Elevated card</span>
              <p className="text-body-sm text-foreground-secondary mt-3">Raised container for focal content or modals.</p>
            </div>
            <div className="bg-surface border border-border-accent rounded-card p-6 shadow-glow">
              <span className="text-label uppercase tracking-widest text-accent-teal">Accent card</span>
              <p className="text-body-sm text-foreground-secondary mt-3">Highlighted container with accent border and glow.</p>
            </div>
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Input Fields">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            <div className="space-y-2">
              <label className="text-label uppercase tracking-widest text-foreground-muted">Default input</label>
              <Input placeholder="Enter value..." className="bg-surface border-border text-foreground placeholder:text-foreground-muted focus:border-border-accent focus:ring-1 focus:ring-ring" />
            </div>
            <div className="space-y-2">
              <label className="text-label uppercase tracking-widest text-foreground-muted">Disabled input</label>
              <Input placeholder="Disabled..." disabled className="bg-surface border-border" />
            </div>
          </div>
        </Section>

        {/* Checkboxes */}
        <Section title="Checkboxes">
          <div className="flex gap-8 flex-wrap">
            <div className="flex items-center gap-3">
              <Checkbox id="c1" className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              <label htmlFor="c1" className="text-body-sm text-foreground-secondary">Unchecked</label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="c2" checked className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              <label htmlFor="c2" className="text-body-sm text-foreground-secondary">Checked</label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="c3" disabled className="border-border" />
              <label htmlFor="c3" className="text-body-sm text-foreground-muted">Disabled</label>
            </div>
          </div>
        </Section>

        {/* Badges / Tags */}
        <Section title="Badges & Tags">
          <div className="flex gap-3 flex-wrap">
            <Badge className="bg-gradient-accent-subtle text-accent-teal border border-accent-teal/20 rounded-sharp px-3 py-1 text-mono-xs font-mono uppercase tracking-wider">Active</Badge>
            <Badge className="bg-surface text-foreground-secondary border border-border rounded-sharp px-3 py-1 text-mono-xs font-mono uppercase tracking-wider">Default</Badge>
            <Badge className="bg-success/10 text-success border border-success/20 rounded-sharp px-3 py-1 text-mono-xs font-mono uppercase tracking-wider">Verified</Badge>
            <Badge className="bg-warning/10 text-warning border border-warning/20 rounded-sharp px-3 py-1 text-mono-xs font-mono uppercase tracking-wider">Pending</Badge>
            <Badge className="bg-destructive/10 text-destructive border border-destructive/20 rounded-sharp px-3 py-1 text-mono-xs font-mono uppercase tracking-wider">Error</Badge>
            <Badge className="bg-info/10 text-info border border-info/20 rounded-sharp px-3 py-1 text-mono-xs font-mono uppercase tracking-wider">Info</Badge>
          </div>
        </Section>

        {/* Progress Bars */}
        <Section title="Progress Bars">
          <div className="space-y-6 max-w-lg">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-caption text-foreground-secondary">Coverage</span>
                <span className="text-mono-xs font-mono text-accent-teal">72%</span>
              </div>
              <div className="h-2 bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-gradient-accent rounded-full" style={{ width: "72%" }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-caption text-foreground-secondary">Completion</span>
                <span className="text-mono-xs font-mono text-foreground-muted">35%</span>
              </div>
              <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-foreground-muted rounded-full" style={{ width: "35%" }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-caption text-foreground-secondary">Risk level</span>
                <span className="text-mono-xs font-mono text-warning">High</span>
              </div>
              <div className="h-2 bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-warning rounded-full" style={{ width: "85%" }} />
              </div>
            </div>
          </div>
        </Section>

        {/* Tabs / Pills */}
        <Section title="Tabs / Pills">
          <Tabs defaultValue="overview" className="max-w-md">
            <TabsList className="bg-surface border border-border p-1 rounded-card">
              <TabsTrigger value="overview" className="data-[state=active]:bg-gradient-accent-subtle data-[state=active]:text-accent-teal text-foreground-muted rounded px-4 py-1.5 text-body-sm transition-colors">Overview</TabsTrigger>
              <TabsTrigger value="actors" className="data-[state=active]:bg-gradient-accent-subtle data-[state=active]:text-accent-teal text-foreground-muted rounded px-4 py-1.5 text-body-sm transition-colors">Actors</TabsTrigger>
              <TabsTrigger value="coverage" className="data-[state=active]:bg-gradient-accent-subtle data-[state=active]:text-accent-teal text-foreground-muted rounded px-4 py-1.5 text-body-sm transition-colors">Coverage</TabsTrigger>
            </TabsList>
          </Tabs>
        </Section>

        {/* Sidebar Panel Example */}
        <Section title="Sidebar Panel">
          <div className="w-64 bg-surface border border-border rounded-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <span className="text-label uppercase tracking-widest text-foreground-muted">Workspace</span>
            </div>
            {["Discovery", "Coverage", "Actors", "Summary"].map((item, i) => (
              <div
                key={item}
                className={`px-4 py-3 text-body-sm cursor-pointer transition-colors ${
                  i === 1
                    ? "bg-gradient-accent-subtle text-accent-teal border-l-2 border-accent-teal"
                    : "text-foreground-secondary hover:bg-elevated hover:text-foreground border-l-2 border-transparent"
                }`}
              >
                {item}
              </div>
            ))}
          </div>
        </Section>

        {/* Shadows */}
        <Section title="Shadows">
          <div className="flex gap-8 flex-wrap">
            {[
              { name: "sm", cls: "shadow-sm" },
              { name: "md", cls: "shadow-md" },
              { name: "lg", cls: "shadow-lg" },
              { name: "glow", cls: "shadow-glow" },
            ].map(s => (
              <div key={s.name} className="flex flex-col items-center gap-3">
                <div className={`w-24 h-24 bg-surface rounded-card border border-border ${s.cls}`} />
                <span className="text-mono-xs font-mono text-foreground-muted">{s.name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <footer className="pt-12 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="h-0.5 w-8 bg-gradient-accent rounded-full" />
            <span className="text-mono-xs font-mono text-foreground-muted">æXs NEXUS · v1.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default DesignSystem;
