import type { ReactNode } from "react";
import { Loader2, X as XIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared proposal type used by all AI-assisted enrichment panels
 * (URL scrape, Document upload, Web search). The optional `source_url`
 * field is currently only populated by Web search.
 */
export interface ReviewProposal {
  entry_name: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  source_url?: string | null;
  /** Optional per-item prose (e.g. product/service description from analyze-actor). */
  description?: string | null;
}

const CONFIDENCE_BADGE: Record<ReviewProposal["confidence"], string> = {
  high: "bg-success/15 text-success",
  medium: "bg-info/15 text-info",
  low: "bg-warning/15 text-warning",
};

interface ProposalReviewListProps {
  proposals: ReviewProposal[];
  summary?: string;
  acceptingIdx: number | null;
  bulkAccepting: boolean;
  onAcceptOne: (proposal: ReviewProposal) => void;
  onDismissOne: (idx: number) => void;
  onAcceptAll: () => void;
  onDismissAll: () => void;
  onClose: () => void;
  /**
   * Optional renderer for source attribution displayed below each proposal's
   * evidence. URL/Document panels pass undefined; Web search renders a
   * compact source link.
   */
  renderSource?: (proposal: ReviewProposal) => ReactNode;
}

/**
 * Reusable review block for AI-assisted enrichment panels. Renders the
 * (optional) summary, the proposal list with per-row Accept/Dismiss, and
 * the bulk action footer. The empty sub-state ("All proposals reviewed.")
 * is also handled here.
 *
 * Closure-safety, DB writes, and panel state transitions remain the
 * responsibility of the parent panel — this component only renders.
 */
export const ProposalReviewList = ({
  proposals,
  summary,
  acceptingIdx,
  bulkAccepting,
  onAcceptOne,
  onDismissOne,
  onAcceptAll,
  onDismissAll,
  onClose,
  renderSource,
}: ProposalReviewListProps) => {
  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-xs text-foreground-muted italic leading-relaxed">
          "{summary}"
        </p>
      )}

      {proposals.length === 0 ? (
        <div className="flex items-center justify-between gap-2 py-2">
          <span className="text-sm text-foreground-secondary">
            All proposals reviewed.
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {proposals.map((p, i) => (
              <li
                key={`${p.entry_name}-${i}`}
                className="border-l-2 border-accent-teal/60 border-dashed bg-surface/40 rounded-r-md pl-3 pr-2 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-foreground">
                        {p.entry_name}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium",
                          CONFIDENCE_BADGE[p.confidence],
                        )}
                      >
                        {p.confidence}
                      </span>
                    </div>
                    {p.evidence && (
                      <p className="text-xs italic text-foreground-muted mt-1 leading-relaxed">
                        {p.evidence}
                      </p>
                    )}
                    {renderSource && (
                      <div className="mt-1">{renderSource(p)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 border-accent-teal/40 text-accent-teal hover:bg-accent-teal/10 hover:text-accent-teal"
                      onClick={() => onAcceptOne(p)}
                      disabled={acceptingIdx !== null || bulkAccepting}
                      aria-label={`Accept ${p.entry_name}`}
                    >
                      {acceptingIdx === i ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => onDismissOne(i)}
                      disabled={acceptingIdx !== null || bulkAccepting}
                      aria-label={`Dismiss ${p.entry_name}`}
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={onAcceptAll}
              disabled={bulkAccepting || acceptingIdx !== null}
            >
              {bulkAccepting && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Accept all visible ({proposals.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismissAll}
              disabled={bulkAccepting || acceptingIdx !== null}
            >
              Dismiss all
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
