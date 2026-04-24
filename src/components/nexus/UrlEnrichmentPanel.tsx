import { useState, type KeyboardEvent } from "react";
import { Loader2, X as XIcon, Link2, ChevronRight } from "lucide-react";
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
  | { kind: "fetching"; url: string }
  | { kind: "reviewing"; url: string; proposals: Proposal[]; summary?: string }
  | { kind: "empty"; url: string; message: string }
  | { kind: "error"; message: string };

interface UrlEnrichmentPanelProps {
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
  onItemAccepted: (item: string, nextAnalysisData: Record<string, unknown>) => void;
}

// (Proposal display styling moved to ProposalReviewList.)

function hostnameOf(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname.replace(/^www\./, ""),
      path: u.pathname === "/" ? "" : u.pathname,
    };
  } catch {
    return { host: url, path: "" };
  }
}

export const UrlEnrichmentPanel = ({
  actorId,
  sectionKey,
  sectionTitle,
  actorContext,
  existingItems,
  currentAnalysisData,
  onClose,
  onItemAccepted,
}: UrlEnrichmentPanelProps) => {
  const [state, setState] = useState<PanelState>({ kind: "input" });
  const [urlInput, setUrlInput] = useState("");
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [bulkAccepting, setBulkAccepting] = useState(false);

  // Local mutable snapshot of analysis_data — updated on each accept so
  // the next write merges correctly without re-fetching.
  const [localAnalysis, setLocalAnalysis] = useState<Record<string, unknown>>(
    () => ({ ...(currentAnalysisData ?? {}) }),
  );

  const startFetch = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setState({
        kind: "error",
        message: "Please enter a valid URL starting with http:// or https://",
      });
      return;
    }
    setState({ kind: "fetching", url });
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-from-url",
        {
          body: {
            url,
            section_key: sectionKey,
            actor_context: actorContext,
            existing_items: existingItems,
          },
        },
      );
      if (error) {
        // supabase.functions.invoke wraps non-2xx in an error.
        // Try to surface the body's error message if present.
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
      if (proposals.length === 0) {
        setState({
          kind: "empty",
          url,
          message:
            data?.extraction_summary ||
            `No new ${sectionTitle.toLowerCase()} found on this URL.`,
        });
        return;
      }
      setState({
        kind: "reviewing",
        url,
        proposals,
        summary: data?.extraction_summary,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const acceptProposal = async (proposal: Proposal) => {
    // Compute next analysis from the latest local snapshot — not closure-captured state.
    const merged = appendManualOntologyItems(
      localAnalysis[sectionKey],
      [proposal.entry_name],
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

    // Functional setState — apply against the latest state, not the closure.
    // Filter by reference identity (proposals are unique objects per review session).
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
    // Snapshot the queue once — iteration is stable across await boundaries.
    const queue = [...state.proposals];
    setBulkAccepting(true);
    try {
      for (const proposal of queue) {
        await acceptProposal(proposal);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed during bulk accept");
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
      if (urlInput.trim()) startFetch(urlInput);
    }
  };

  return (
    <div className="mt-4 bg-elevated border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">
            URL scrape
          </span>
          {state.kind !== "input" && state.kind !== "error" && (
            <>
              <ChevronRight className="w-3 h-3 text-foreground-muted shrink-0" />
              <span className="text-xs text-foreground-muted truncate min-w-0">
                <span className="text-foreground">{hostnameOf(state.url).host}</span>
                <span>{hostnameOf(state.url).path}</span>
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close URL scrape"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-elevated transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {state.kind === "input" && (
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleInputKey}
              placeholder="https://example.com/about"
              className="h-9 text-sm"
              autoFocus
            />
            <Button
              size="sm"
              onClick={() => startFetch(urlInput)}
              disabled={!urlInput.trim()}
            >
              Fetch
            </Button>
          </div>
        )}

        {state.kind === "fetching" && (
          <div className="flex items-center gap-2 py-2 text-sm text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
            <span>
              Extracting from{" "}
              <span className="text-foreground font-medium">
                {hostnameOf(state.url).host}
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
          />
        )}

        {state.kind === "empty" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-foreground-secondary">{state.message}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setUrlInput("");
                  setState({ kind: "input" });
                }}
              >
                Try another URL
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
