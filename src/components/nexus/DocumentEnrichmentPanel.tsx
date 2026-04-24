import { useRef, useState, type ChangeEvent } from "react";
import {
  Loader2,
  X as XIcon,
  FileText,
  ChevronRight,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { appendManualOntologyItems } from "@/lib/actorEnrichment";
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
  | { kind: "extracting"; filename: string }
  | { kind: "analyzing"; filename: string }
  | {
      kind: "reviewing";
      filename: string;
      proposals: Proposal[];
      summary?: string;
    }
  | { kind: "empty"; filename: string; message: string }
  | { kind: "error"; message: string };

interface DocumentEnrichmentPanelProps {
  actorId: string;
  sectionKey: OntologyKey;
  sectionTitle: string;
  actorContext: {
    actor_name: string;
    actor_description?: string | null;
    country?: string | null;
  };
  existingItems: string[];
  currentAnalysisData: Record<string, unknown> | null;
  onClose: () => void;
  onItemAccepted: (
    item: string,
    nextAnalysisData: Record<string, unknown>,
  ) => void;
}

const CONFIDENCE_BADGE: Record<Proposal["confidence"], string> = {
  high: "bg-success/15 text-success",
  medium: "bg-info/15 text-info",
  low: "bg-warning/15 text-warning",
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_EXT = [".pdf", ".docx", ".txt"];

function hasAcceptedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXT.some((ext) => lower.endsWith(ext));
}

export const DocumentEnrichmentPanel = ({
  actorId,
  sectionKey,
  sectionTitle,
  actorContext,
  existingItems,
  currentAnalysisData,
  onClose,
  onItemAccepted,
}: DocumentEnrichmentPanelProps) => {
  const [state, setState] = useState<PanelState>({ kind: "input" });
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localAnalysis, setLocalAnalysis] = useState<Record<string, unknown>>(
    () => ({ ...(currentAnalysisData ?? {}) }),
  );

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (!hasAcceptedExt(file.name)) {
      setState({
        kind: "error",
        message: "Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setState({
        kind: "error",
        message: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
      });
      return;
    }

    // Step 1: extract text
    setState({ kind: "extracting", filename: file.name });
    let extractedText: string;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await supabase.functions.invoke(
        "extract-file-text",
        { body: formData },
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
      extractedText = (data?.text ?? "") as string;
      if (!extractedText.trim()) {
        setState({
          kind: "error",
          message:
            "Could not extract any readable text from this document.",
        });
        return;
      }
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to extract text",
      });
      return;
    }

    // Step 2: analyze
    setState({ kind: "analyzing", filename: file.name });
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-from-document",
        {
          body: {
            extracted_text: extractedText,
            section_key: sectionKey,
            source_description: file.name,
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
      if (proposals.length === 0) {
        setState({
          kind: "empty",
          filename: file.name,
          message:
            data?.extraction_summary ||
            `No new ${sectionTitle.toLowerCase()} found in this document.`,
        });
        return;
      }
      setState({
        kind: "reviewing",
        filename: file.name,
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

  const filenameOf = (): string | null =>
    state.kind === "extracting" ||
    state.kind === "analyzing" ||
    state.kind === "reviewing" ||
    state.kind === "empty"
      ? state.filename
      : null;

  return (
    <div className="mt-4 bg-elevated border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">
            Document upload
          </span>
          {filenameOf() && (
            <>
              <ChevronRight className="w-3 h-3 text-foreground-muted shrink-0" />
              <span className="text-xs text-foreground truncate min-w-0">
                {filenameOf()}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document upload"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-elevated transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {state.kind === "input" && (
          <div className="space-y-3">
            <p className="text-xs text-foreground-muted leading-relaxed">
              Upload a PDF, DOCX, or TXT file. The system will extract its
              content and propose {sectionTitle.toLowerCase()}.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Choose document"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" /> Choose file
            </Button>
            <p className="text-[11px] text-foreground-muted">
              Accepted: .pdf .docx .txt — max 10 MB
            </p>
          </div>
        )}

        {state.kind === "extracting" && (
          <div className="flex items-center gap-2 py-2 text-sm text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
            <span>
              Extracting text from{" "}
              <span className="text-foreground font-medium">
                {state.filename}
              </span>
              …
            </span>
          </div>
        )}

        {state.kind === "analyzing" && (
          <div className="flex items-center gap-2 py-2 text-sm text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
            <span>
              Analyzing{" "}
              <span className="text-foreground font-medium">
                {state.filename}
              </span>
              …
            </span>
          </div>
        )}

        {state.kind === "reviewing" && (
          <div className="space-y-3">
            {state.summary && (
              <p className="text-xs text-foreground-muted italic leading-relaxed">
                "{state.summary}"
              </p>
            )}

            {state.proposals.length === 0 ? (
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
                  {state.proposals.map((p, i) => (
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
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 border-accent-teal/40 text-accent-teal hover:bg-accent-teal/10 hover:text-accent-teal"
                            onClick={() => handleAcceptOne(p)}
                            disabled={
                              acceptingIdx !== null || bulkAccepting
                            }
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
                            onClick={() => handleDismissOne(i)}
                            disabled={
                              acceptingIdx !== null || bulkAccepting
                            }
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
                    onClick={handleAcceptAll}
                    disabled={bulkAccepting || acceptingIdx !== null}
                  >
                    {bulkAccepting && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Accept all visible ({state.proposals.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismissAll}
                    disabled={bulkAccepting || acceptingIdx !== null}
                  >
                    Dismiss all
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {state.kind === "empty" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-foreground-secondary">{state.message}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setState({ kind: "input" })}
              >
                Try another file
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
