import { useState } from "react";
import { Check, ChevronDown, Loader2, X, ExternalLink, FileText, Ban, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActorAnalysisStatus } from "@/hooks/useAnalysis";
import type { ActorAnalysis, MatchedCategory } from "@/types/analyzed-actors";

interface AnalyzedActorCardProps {
  state: ActorAnalysisStatus;
  excluded?: boolean;
  onToggleExclude?: (actorId: string) => void;
  /** When true, hides exclude/restore action buttons (review-only view). */
  readOnly?: boolean;
}

const sectionCount = (analysis: ActorAnalysis | null | undefined) => {
  if (!analysis) return { capabilities: 0, competences: 0, domains: 0, products: 0, services: 0 };
  const flatten = (cats: MatchedCategory[]) => cats.reduce((sum, c) => sum + (c.entries?.length || 0), 0);
  return {
    capabilities: flatten(analysis.capabilities),
    competences: flatten(analysis.competences),
    domains: analysis.domains.length,
    products: analysis.products.length,
    services: analysis.services.length,
  };
};

interface SectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section = ({ title, count, children, defaultOpen = false }: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2.5 text-left hover:bg-elevated/30 px-1 transition-colors"
      >
        <span className="text-body-sm text-foreground-secondary">
          {title} <span className="text-foreground-muted font-mono text-mono-xs ml-1">({count})</span>
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-foreground-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="pb-3 pt-1 px-1 space-y-2">{children}</div>}
    </div>
  );
};

const EvidenceLine = ({ label, evidence }: { label: string; evidence: string }) => (
  <div className="flex gap-2 text-caption">
    <Check className="w-3 h-3 text-accent-teal shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <span className="text-foreground">{label}</span>
      <span className="text-foreground-muted"> — </span>
      <span className="text-foreground-muted italic">{evidence}</span>
    </div>
  </div>
);

const AnalyzedActorCard = ({ state, excluded = false, onToggleExclude, readOnly = false }: AnalyzedActorCardProps) => {
  const { source_actor: actor, status, result: analysis, error } = state;
  const counts = sectionCount(analysis);
  const isSkipped = status === "skipped";
  const isError = status === "error";
  const isAnalyzing = status === "analyzing";
  const isWaiting = status === "waiting";
  const isComplete = status === "complete";

  // Card-level expand/collapse (collapsed by default)
  const [expanded, setExpanded] = useState(false);

  // Build a 1-line preview from first capability if available
  const previewLine = (() => {
    if (!analysis) return null;
    const firstCat = analysis.capabilities[0];
    const firstEntry = firstCat?.entries?.[0];
    if (firstEntry) return firstEntry.entryName;
    if (analysis.products[0]) return analysis.products[0].productName;
    if (analysis.services[0]) return analysis.services[0].serviceName;
    return null;
  })();

  const totalMatches =
    counts.capabilities + counts.competences + counts.domains + counts.products + counts.services;

  return (
    <div className={cn(
      "border rounded-card bg-surface transition-all border-l-4",
      excluded && "opacity-50 border-destructive/30 border-l-destructive/40",
      // Reference (non-commercial) actor — distinct blue/info lane to tie it to the info box
      !excluded && isSkipped && "opacity-50 bg-accent-blue/[0.03] border-accent-blue/20 border-l-accent-blue/60",
      !excluded && isError && "border-destructive/40 border-l-destructive/40",
      !excluded && isAnalyzing && "border-accent-teal/50 border-l-accent-teal/50",
      !excluded && isComplete && "border-border border-l-accent-teal",
      !excluded && isWaiting && "border-border border-l-border",
    )}>
      {/* Header — always visible, clickable to expand */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => isComplete && setExpanded(!expanded)}
            className={cn(
              "flex-1 min-w-0 text-left",
              isComplete && "cursor-pointer",
            )}
            disabled={!isComplete}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={cn(
                "text-body font-medium text-foreground",
                excluded && "line-through text-foreground-muted",
              )}>
                {actor.name}
              </h4>
              {isSkipped && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-sharp border-accent-blue/40 text-accent-blue bg-accent-blue/5">
                  Reference — not analyzed
                </Badge>
              )}
              {isError && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-sharp border-destructive/40 text-destructive">
                  Error
                </Badge>
              )}
              {excluded && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-sharp border-destructive/40 text-destructive">
                  Excluded
                </Badge>
              )}
              {isComplete && totalMatches > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-sharp border-accent-teal/30 text-accent-teal font-mono">
                  {totalMatches} matches
                </Badge>
              )}
            </div>
            {(actor.location || actor.country) && (
              <p className="text-caption text-foreground-muted mt-0.5">
                {[actor.location, actor.country].filter(Boolean).join(", ")}
              </p>
            )}
            {/* Preview line when collapsed */}
            {isComplete && !expanded && previewLine && (
              <p className="text-caption text-foreground-secondary mt-1.5 truncate">
                <span className="text-foreground-muted">→ </span>{previewLine}
              </p>
            )}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {actor.website && (
              <a
                href={actor.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-foreground-muted hover:text-foreground-secondary transition-colors p-1"
                title="Open website"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {isComplete && onToggleExclude && !readOnly && (
              <button
                onClick={() => onToggleExclude(state.actor_id)}
                className={cn(
                  "transition-colors p-1",
                  excluded
                    ? "text-foreground-muted hover:text-foreground-secondary"
                    : "text-foreground-muted hover:text-destructive",
                )}
                title={excluded ? "Re-include in final set" : "Exclude from final set"}
              >
                {excluded ? <Undo2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
              </button>
            )}
            {isComplete && <Check className="w-4 h-4 text-accent-teal" />}
            {isAnalyzing && <Loader2 className="w-4 h-4 text-accent-teal animate-spin" />}
            {isError && <X className="w-4 h-4 text-destructive" />}
            {isWaiting && <div className="w-4 h-4 rounded-full border border-border-subtle" />}
            {isComplete && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-foreground-muted hover:text-foreground-secondary transition-colors p-1"
                title={expanded ? "Collapse" : "Expand"}
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
              </button>
            )}
          </div>
        </div>

        {/* Reference actor — show description only */}
        {isSkipped && (
          <p className="text-body-sm text-foreground-secondary">{actor.description}</p>
        )}

        {/* Error */}
        {isError && (
          <p className="text-caption text-destructive">{error}</p>
        )}

        {/* Analyzing */}
        {isAnalyzing && (
          <p className="text-caption text-foreground-muted">Gathering sources and analyzing capability profile…</p>
        )}
      </div>

      {/* Expanded detail */}
      {isComplete && analysis && expanded && (
        <div className="px-4 pb-2 space-y-0">
          <Section title="Capabilities" count={counts.capabilities} defaultOpen>
            {analysis.capabilities.map((cat, i) => (
              <div key={i} className="space-y-1">
                <p className="text-mono-xs font-mono uppercase tracking-wider text-foreground-muted">
                  {cat.categoryName}
                </p>
                {cat.entries.map((e, j) => (
                  <EvidenceLine key={j} label={e.entryName} evidence={e.evidence} />
                ))}
              </div>
            ))}
          </Section>

          <Section title="Competences" count={counts.competences}>
            {analysis.competences.map((cat, i) => (
              <div key={i} className="space-y-1">
                <p className="text-mono-xs font-mono uppercase tracking-wider text-foreground-muted">
                  {cat.categoryName}
                </p>
                {cat.entries.map((e, j) => (
                  <EvidenceLine key={j} label={e.entryName} evidence={e.evidence} />
                ))}
              </div>
            ))}
          </Section>

          <Section title="Domains" count={counts.domains}>
            {analysis.domains.map((d, i) => (
              <EvidenceLine key={i} label={d.domainName} evidence={d.evidence} />
            ))}
          </Section>

          <Section title="Products" count={counts.products}>
            {analysis.products.map((p, i) => (
              <div key={i} className="text-caption space-y-0.5">
                <p className="text-foreground font-medium">{p.productName}</p>
                {p.description && <p className="text-foreground-secondary">{p.description}</p>}
                <p className="text-foreground-muted italic">"{p.evidence}"</p>
              </div>
            ))}
          </Section>

          <Section title="Services" count={counts.services}>
            {analysis.services.map((s, i) => (
              <div key={i} className="text-caption space-y-0.5">
                <p className="text-foreground font-medium">{s.serviceName}</p>
                {s.description && <p className="text-foreground-secondary">{s.description}</p>}
                <p className="text-foreground-muted italic">"{s.evidence}"</p>
              </div>
            ))}
          </Section>

          {/* Classification */}
          {analysis.classification && analysis.classification.details.length > 0 && (
            <div className="border-t border-border-subtle pt-3 pb-2 space-y-1.5">
              <p className="text-mono-xs font-mono uppercase tracking-wider text-foreground-muted">
                Classification
              </p>
              {analysis.classification.details.map((d, i) => (
                <div key={i} className="text-caption">
                  <span className="font-mono text-info uppercase">
                    {analysis.classification!.levelNormalized.replace("_", " ")}
                  </span>
                  <span className="text-foreground-muted"> · </span>
                  <span className="text-foreground">{d.system}</span>
                  {d.levelNationalTerm && (
                    <>
                      <span className="text-foreground-muted"> · </span>
                      <span className="font-mono text-foreground-secondary">{d.levelNationalTerm}</span>
                    </>
                  )}
                  <p className="text-foreground-muted italic mt-0.5">{d.evidence}</p>
                </div>
              ))}
            </div>
          )}

          {/* Standards */}
          {analysis.standards && analysis.standards.length > 0 && (
            <div className="border-t border-border-subtle pt-3 pb-2 space-y-1.5">
              <p className="text-mono-xs font-mono uppercase tracking-wider text-foreground-muted">
                Standards
              </p>
              <TooltipProvider>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.standards.map((s, i) => (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <Badge className="bg-surface text-foreground-secondary border border-border text-[10px] px-1.5 py-0 h-5 rounded-sharp font-mono cursor-help">
                          {s.standardName}{s.standardNumber ? ` ${s.standardNumber}` : ""}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-caption italic">{s.evidence}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>
          )}

          {/* Customer history */}
          {analysis.customerHistory && analysis.customerHistory.length > 0 && (
            <div className="border-t border-border-subtle pt-3 pb-2 space-y-1.5">
              <p className="text-mono-xs font-mono uppercase tracking-wider text-foreground-muted">
                Customer references
              </p>
              {analysis.customerHistory.map((c, i) => (
                <div key={i} className="text-caption">
                  <span className="text-foreground font-medium">{c.customerName}</span>
                  {(c.segment || c.year) && (
                    <span className="text-foreground-muted">
                      {" ("}
                      {[c.segment, c.year].filter(Boolean).join(", ")}
                      {")"}
                    </span>
                  )}
                  <p className="text-foreground-muted italic mt-0.5">"{c.evidence}"</p>
                </div>
              ))}
            </div>
          )}

          {/* Analysis sources */}
          {analysis.analysisSources.length > 0 && (
            <div className="border-t border-border-subtle pt-3 pb-2 space-y-1">
              <p className="text-mono-xs font-mono uppercase tracking-wider text-foreground-muted">
                Sources used
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {analysis.analysisSources.slice(0, 8).map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mono-xs font-mono text-foreground-muted hover:text-foreground-secondary transition-colors truncate max-w-[260px]"
                    title={s.title}
                  >
                    {(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })()}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer — always visible on completed cards */}
      {isComplete && (
        <div className="border-t border-border-subtle px-4 py-2 flex justify-end">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="gap-1.5 h-7 text-xs text-foreground-muted"
                  >
                    <FileText className="w-3 h-3" />
                    View full profile
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-caption">Available after database check.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default AnalyzedActorCard;
