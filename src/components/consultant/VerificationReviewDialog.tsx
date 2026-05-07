// Phase 6.5.5b: shared review dialog used by both the verification workspace
// (suggestion approval flow → fn_approve_and_verify) and the actor profile
// re-verify button (re-verification flow → fn_verify_actor).
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
import { Plus, Trash2 } from "lucide-react";
import type {
  VerificationEvidenceItem,
  VerifierConfidence,
} from "@/types/verification";

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
  /** Phase 6.5.6: optional past-outcomes summary panel rendered above the read-only actor summary. */
  outcomesPanel?: React.ReactNode;
  busy?: boolean;
}

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
  busy = false,
}: Props) => {
  const [evidence, setEvidence] = useState<VerificationEvidenceItem[]>([{}]);
  const [decay, setDecay] = useState<string>("90");
  const [confidence, setConfidence] = useState<VerifierConfidence | "">("");
  const [notes, setNotes] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const reset = () => {
    setEvidence([{}]);
    setDecay("90");
    setConfidence("");
    setNotes("");
    setShowReject(false);
    setRejectReason("");
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

  const handleApprove = async () => {
    if (!confidence) return;
    const decayOpt = DECAY_OPTIONS.find((d) => d.value === decay);
    const decays_at =
      decayOpt && decayOpt.days
        ? new Date(Date.now() + decayOpt.days * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const cleanEvidence = evidence.filter((e) => e.source_url || e.note);
    await onApprove({ evidence: cleanEvidence, decays_at, confidence, notes });
    reset();
  };

  const handleReject = async () => {
    if (!onReject) return;
    await onReject(rejectReason);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {outcomesPanel}

        {/* Read-only actor summary */}
        <div className="bg-surface border border-border rounded-md p-4 text-sm">
          {summary}
        </div>

        {showReject && onReject ? (
          <div className="space-y-3">
            <Label>Reason (optional)</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this suggestion being rejected?"
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowReject(false)} disabled={busy}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={busy}
              >
                Confirm rejection
              </Button>
            </div>
          </div>
        ) : (
          <>
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

            {/* Decay window */}
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

            {/* Confidence */}
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

            {/* Notes */}
            <div className="space-y-2">
              <Label>Verifier notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional context for this verification…"
                rows={3}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>
                Cancel
              </Button>
              {onReject && (
                <Button
                  variant="ghost"
                  onClick={() => setShowReject(true)}
                  disabled={busy}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Reject
                </Button>
              )}
              <Button onClick={handleApprove} disabled={busy || !confidence}>
                {primaryLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
