// Phase 6.5.5b: shared review dialog used by both the verification workspace
// (suggestion approval flow → fn_approve_and_verify) and the actor profile
// re-verify button (re-verification flow → fn_verify_actor).
//
// B4: gains an optional "Complete & verify" mode (or "Complete & re-verify"
// on the re-verify path). When the parent passes `completion`, the dialog
// surfaces a second primary action that expands the body into the four-action
// ontology UX (CompleteAndVerifyBody) and submits decisions via
// completion.onSubmit.
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, Sparkles } from "lucide-react";
import type {
  VerificationEvidenceItem,
  VerifierConfidence,
} from "@/types/verification";
import {
  SharedVerificationBody,
  type CompletionDecision,
  type CompletionSeed,
  type SharedVerificationMode,
} from "@/components/verification/SharedVerificationBody";

const DECAY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "180", label: "180 days", days: 180 },
  { value: "none", label: "No decay", days: null },
];

export interface VerificationSubmitPayload {
  evidence: VerificationEvidenceItem[];
  decays_at: string | null;
  confidence: VerifierConfidence;
  notes: string;
}

export interface CompletionConfig {
  /** Label for the second primary action (e.g. "Complete & verify"). */
  actionLabel: string;
  /** Label after expansion (e.g. "Save completion and verify"). */
  submitLabel: string;
  /** Website to pass to enrich-from-url. */
  websiteUrl: string | null;
  /** Context for enrich-from-url. */
  actorContext: { actor_name: string; country: string | null };
  /** Pre-seeded pills per section. */
  seed: CompletionSeed;
  /** Body mode (default 'from-queue'). Re-verify callers should pass 're-verify'. */
  mode?: SharedVerificationMode;
  /** Whether the current viewer is allowed to use completion (admin gate). */
  enabled: boolean;
  /** Disabled-state tooltip (shown when enabled=false). */
  disabledReason?: string;
  /** Submission handler invoked when the consultant submits the completion flow. */
  onSubmit: (
    verification: VerificationSubmitPayload,
    decisions: CompletionDecision[],
  ) => Promise<void>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Read-only summary block rendered above the inputs. */
  summary: React.ReactNode;
  primaryLabel: string;
  onApprove: (payload: VerificationSubmitPayload) => Promise<void>;
  /** Optional secondary action (Reject) for the suggestion-approval flow. */
  onReject?: (reason: string) => Promise<void>;
  /** Phase 6.5.6: optional past-outcomes summary panel. */
  outcomesPanel?: React.ReactNode;
  /** B4: optional completion-mode config. When set, surfaces a second primary action. */
  completion?: CompletionConfig;
  busy?: boolean;
}

type Mode = "approve" | "reject" | "complete";

export const VerificationReviewDialog = ({
  open,
  onOpenChange,
  title,
  description,
  summary,
  primaryLabel,
  onApprove,
  onReject,
  outcomesPanel,
  completion,
  busy = false,
}: Props) => {
  const [evidence, setEvidence] = useState<VerificationEvidenceItem[]>([{}]);
  const [decay, setDecay] = useState<string>("90");
  const [confidence, setConfidence] = useState<VerifierConfidence | "">("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<Mode>("approve");
  const [rejectReason, setRejectReason] = useState("");
  const [decisions, setDecisions] = useState<CompletionDecision[]>([]);

  const reset = () => {
    setEvidence([{}]);
    setDecay("90");
    setConfidence("");
    setNotes("");
    setMode("approve");
    setRejectReason("");
    setDecisions([]);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const addEvidence = () => {
    if (evidence.length < 5) setEvidence((prev) => [...prev, {}]);
  };
  const removeEvidence = (i: number) =>
    setEvidence((prev) => prev.filter((_, idx) => idx !== i));
  const updateEvidence = (i: number, field: keyof VerificationEvidenceItem, value: string) =>
    setEvidence((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value || undefined } : e)),
    );

  const buildPayload = (): VerificationSubmitPayload | null => {
    if (!confidence) return null;
    const decayOpt = DECAY_OPTIONS.find((d) => d.value === decay);
    const decays_at =
      decayOpt && decayOpt.days
        ? new Date(Date.now() + decayOpt.days * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const cleanEvidence = evidence.filter((e) => e.source_url || e.note);
    return { evidence: cleanEvidence, decays_at, confidence, notes };
  };

  const handleApprove = async () => {
    const payload = buildPayload();
    if (!payload) return;
    await onApprove(payload);
    reset();
  };

  const handleComplete = async () => {
    if (!completion) return;
    const payload = buildPayload();
    if (!payload) return;
    await completion.onSubmit(payload, decisions);
    reset();
  };

  const handleReject = async () => {
    if (!onReject) return;
    await onReject(rejectReason);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {outcomesPanel}

        {/* Read-only actor summary */}
        <div className="bg-surface border border-border rounded-md p-4 text-sm">
          {summary}
        </div>

        {mode === "reject" && onReject ? (
          <div className="space-y-3">
            <Label>Reason (optional)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this suggestion being rejected?"
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setMode("approve")} disabled={busy}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={busy}>
                Confirm rejection
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* B4: completion-mode body */}
            {mode === "complete" && completion && (
              <SharedVerificationBody
                mode={completion.mode ?? "from-queue"}
                actorContext={completion.actorContext}
                seed={completion.seed}
                urlSeed={completion.websiteUrl}
                evidenceSeed={evidence[0]?.source_url ?? null}
                onEnrichmentUrlCommit={(url) => {
                  setEvidence((prev) => {
                    if (prev.some((e) => e.source_url === url)) return prev;
                    const first = prev[0];
                    if (first && !first.source_url && !first.note) {
                      return [{ source_url: url }, ...prev.slice(1)];
                    }
                    return [{ source_url: url }, ...prev];
                  });
                }}
                onChange={({ decisions: d }) => setDecisions(d)}
              />
            )}

            {/* Evidence */}
            <div className="space-y-2">
              <Label>Evidence sources (optional, up to 5)</Label>
              {evidence.map((e, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <Input
                      value={e.source_url ?? ""}
                      onChange={(ev) => updateEvidence(i, "source_url", ev.target.value)}
                      placeholder="https://source-url..."
                    />
                    <Input
                      value={e.note ?? ""}
                      onChange={(ev) => updateEvidence(i, "note", ev.target.value)}
                      placeholder="Note about this source"
                    />
                  </div>
                  {evidence.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEvidence(i)}
                      className="mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {evidence.length < 5 && (
                <Button variant="ghost" size="sm" onClick={addEvidence}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add source
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Decay window</Label>
              <RadioGroup value={decay} onValueChange={setDecay} className="flex gap-4 flex-wrap">
                {DECAY_OPTIONS.map((d) => (
                  <div key={d.value} className="flex items-center gap-2">
                    <RadioGroupItem value={d.value} id={`decay-${d.value}`} />
                    <Label htmlFor={`decay-${d.value}`} className="font-normal cursor-pointer">
                      {d.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>
                Confidence <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={confidence}
                onValueChange={(v) => setConfidence(v as VerifierConfidence)}
                className="flex gap-4"
              >
                {(["high", "medium", "low"] as const).map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <RadioGroupItem value={c} id={`conf-${c}`} />
                    <Label htmlFor={`conf-${c}`} className="font-normal capitalize cursor-pointer">
                      {c}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Verifier notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional context for this verification…"
                rows={3}
              />
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="ghost" onClick={() => handleClose(false)} disabled={busy}>
                Cancel
              </Button>
              {onReject && mode !== "complete" && (
                <Button
                  variant="outline"
                  onClick={() => setMode("reject")}
                  disabled={busy}
                  className="border-destructive/60 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Reject
                </Button>
              )}
              {mode === "complete" ? (
                <>
                  <Button variant="outline" onClick={() => setMode("approve")} disabled={busy}>
                    Back to approve
                  </Button>
                  <Button onClick={handleComplete} disabled={busy || !confidence}>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    {completion?.submitLabel ?? "Save completion and verify"}
                    {decisions.length > 0 ? ` (${decisions.length})` : ""}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={completion ? "outline" : "default"}
                    onClick={handleApprove}
                    disabled={busy || !confidence}
                  >
                    {primaryLabel}
                  </Button>
                  {completion && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="default"
                              onClick={() => setMode("complete")}
                              disabled={busy || !completion.enabled}
                            >
                              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                              {completion.actionLabel}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!completion.enabled && completion.disabledReason && (
                          <TooltipContent>{completion.disabledReason}</TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
