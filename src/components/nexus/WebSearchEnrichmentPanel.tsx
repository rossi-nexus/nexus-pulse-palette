import { useState, type KeyboardEvent } from "react";
import {
  Loader2,
  X as XIcon,
  Search,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendManualOntologyItems } from "@/lib/actorEnrichment";
import type { EnrichmentAcceptedItem } from "@/types/enrichment";
import {
  ProposalReviewList,
  type ReviewProposal,
} from "@/components/nexus/ProposalReviewList";
import { toast } from "sonner";

export type OntologyKey =
  | "capabilities"
  | "competences"
  | "domains"
  | "products"
  | "services";

type Proposal = ReviewProposal;

type PanelState =
  | { kind: "input" }
  | { kind: "searching"; query: string }
  | {
      kind: "reviewing";
      query: string;
      proposals: Proposal[];
      summary?: string;
      totalResults: number;
    }
  | { kind: "empty"; query: string; message: string }
  | { kind: "error"; message: string };

interface WebSearchEnrichmentPanelProps {
  actorId: string;
  sectionKey: OntologyKey;
  sectionTitle: string;
  actorContext: {
    actor_name: string;
    actor_description?: string | null;
    country?: string | null;
  };
  existingItems: string[];
  /** Snapshot of analysis_data — used to safely merge writes without clobbering siblings. */
  currentAnalysisData: Record<string, unknown> | null;
  onClose: () => void;
  onItemAccepted: (
    item: string,
    nextAnalysisData: Record<string, unknown>,
  ) => void;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const WebSearchEnrichmentPanel = ({
  actorId,
  sectionKey,
  sectionTitle,
  actorContext,
  existingItems,
  currentAnalysisData,
  onClose,
  onItemAccepted,
}: WebSearchEnrichmentPanelProps) => {
  const [state, setState] = useState<PanelState>({ kind: "input" });
  const [queryInput, setQueryInput] = useState("");
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [bulkAccepting, setBulkAccepting] = useState(false);

  const [localAnalysis, setLocalAnalysis] = useState<Record<string, unknown>>(
    () => ({ ...(currentAnalysisData ?? {}) }),
  );

  const startSearch = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (query.length < 3) {
      setState({
        kind: "error",
        message: "Please enter a search query of at least 3 characters.",
      });
      return;
    }
    setState({ kind: "searching", query });
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-from-web-search",
        {
          body: {
            query,
            section_key: sectionKey,
            actor_context: actorContext,
            existing_items: existingItems,
          },
        },
      );
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch {
            /* ignore */
          }
        }
        setState({ kind: "error", message: msg });
        return;
      }
      const proposals = (data?.proposals ?? []) as Proposal[];
      const totalResults = (data?.total_results ?? 0) as number;
      if (proposals.length === 0) {
        setState({
          kind: "empty",
          query,
          message:
            data?.extraction_summary ||
            `No new ${sectionTitle.toLowerCase()} found for this query. Try a different query.`,
        });
        return;
      }
      setState({
        kind: "reviewing",
        query,
        proposals,
        summary: data?.extraction_summary,
        totalResults,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const acceptProposal = async (proposal: Proposal) => {
    const item: EnrichmentAcceptedItem = {
      entry_name: proposal.entry_name,
      source: "web_search",
      source_url: proposal.source_url ?? null,
      evidence: proposal.evidence,
      confidence: proposal.confidence,
      accepted_at: new Date().toISOString(),
    };
    const merged = appendManualOntologyItems(
      localAnalysis[sectionKey],
      [item],
    );
    const nextAnalysis = { ...localAnalysis, [sectionKey]: merged };

    const { error } = await supabase
      .from("user_personal_actors")
      .update({ analysis_data: nextAnalysis as never })
      .eq("id", actorId);

    if (error) {
      throw new Error(error.message);
    }

    setLocalAnalysis(nextAnalysis);
    onItemAccepted(proposal.entry_name, nextAnalysis);

    setState((prev) => {
      if (prev.kind !== "reviewing") return prev;
      return {
        ...prev,
        proposals: prev.proposals.filter((p) => p !== proposal),
      };
    });
  };

  const handleAcceptOne = async (proposal: Proposal) => {
    if (state.kind !== "reviewing") return;
    setAcceptingIdx(state.proposals.indexOf(proposal));
    try {
      await acceptProposal(proposal);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept item");
    } finally {
      setAcceptingIdx(null);
    }
  };

  const handleDismissOne = (idx: number) => {
    if (state.kind !== "reviewing") return;
    const remaining = state.proposals.filter((_, i) => i !== idx);
    setState({ ...state, proposals: remaining });
  };

  const handleAcceptAll = async () => {
    if (state.kind !== "reviewing") return;
    const queue = [...state.proposals];
    setBulkAccepting(true);
    try {
      for (const proposal of queue) {
        await acceptProposal(proposal);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed during bulk accept",
      );
    } finally {
      setBulkAccepting(false);
    }
  };

  const handleDismissAll = () => {
    if (state.kind !== "reviewing") return;
    setState({ ...state, proposals: [] });
  };

  const handleInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (queryInput.trim().length >= 3) startSearch(queryInput);
    }
  };

  const renderSource = (p: Proposal) => {
    if (!p.source_url) return null;
    return (
      <a
        href={p.source_url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-[11px] text-foreground-muted hover:text-accent-teal transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        {hostnameOf(p.source_url)}
      </a>
    );
  };

  return (
    <div className="mt-4 bg-elevated border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <Search className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">
            Web search (AI-assisted)
          </span>
          {(state.kind === "searching" ||
            state.kind === "reviewing" ||
            state.kind === "empty") && (
            <>
              <ChevronRight className="w-3 h-3 text-foreground-muted shrink-0" />
              <span className="text-xs text-foreground truncate min-w-0">
                "{state.query}"
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close web search"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-elevated transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {state.kind === "input" && (
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted leading-relaxed">
              Enter a search query. AI will review snippets from the top
              results and propose {sectionTitle.toLowerCase()}.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={handleInputKey}
                placeholder={`${actorContext.actor_name} ${sectionTitle.toLowerCase()}`}
                className="h-9 text-sm"
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => startSearch(queryInput)}
                disabled={queryInput.trim().length < 3}
              >
                Search
              </Button>
            </div>
            <p className="text-[11px] text-foreground-muted">
              Tip: web search aggregates multiple sources — review each
              proposal carefully.
            </p>
          </div>
        )}

        {state.kind === "searching" && (
          <div className="flex items-center gap-2 py-2 text-sm text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
            <span>
              Searching the web for{" "}
              <span className="text-foreground font-medium">
                "{state.query}"
              </span>
              …
            </span>
          </div>
        )}

        {state.kind === "reviewing" && (
          <ProposalReviewList
            proposals={state.proposals}
            summary={state.summary}
            acceptingIdx={acceptingIdx}
            bulkAccepting={bulkAccepting}
            onAcceptOne={handleAcceptOne}
            onDismissOne={handleDismissOne}
            onAcceptAll={handleAcceptAll}
            onDismissAll={handleDismissAll}
            onClose={onClose}
            renderSource={renderSource}
          />
        )}

        {state.kind === "empty" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-foreground-secondary">
              {state.message}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setQueryInput(state.query);
                  setState({ kind: "input" });
                }}
              >
                Try another query
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-destructive">{state.message}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setState({ kind: "input" })}
              >
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
