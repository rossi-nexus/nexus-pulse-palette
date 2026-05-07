// Phase 6.5.6: dialog to record a programme outcome via fn_record_outcome RPC.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import {
  OUTCOME_LABEL,
  OUTCOME_TYPES,
  type OutcomeEvidenceItem,
  type OutcomeType,
} from "@/types/outcome";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorId: string;
  actorName: string;
  onRecorded?: () => void;
}

export const RecordOutcomeDialog = ({
  open,
  onOpenChange,
  actorId,
  actorName,
  onRecorded,
}: Props) => {
  const { programmes } = useManagedProgrammes();
  const [programmeId, setProgrammeId] = useState<string>("");
  const [outcomeType, setOutcomeType] = useState<OutcomeType | "">("");
  const [completedAt, setCompletedAt] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<OutcomeEvidenceItem[]>([{}]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setProgrammeId("");
    setOutcomeType("");
    setCompletedAt("");
    setNotes("");
    setEvidence([{}]);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const updateEvidence = (
    i: number,
    field: keyof OutcomeEvidenceItem,
    value: string,
  ) =>
    setEvidence((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value || undefined } : e)),
    );

  const submit = async () => {
    if (!programmeId || !outcomeType) return;
    setBusy(true);
    const cleanEvidence = evidence.filter((e) => e.source_url || e.note);
    const { error } = await supabase.rpc("fn_record_outcome", {
      p_programme_id: programmeId,
      p_actor_id: actorId,
      p_outcome_type: outcomeType,
      p_notes: notes || null,
      p_evidence: cleanEvidence as unknown as never,
      p_completed_at: completedAt ? new Date(completedAt).toISOString() : null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Outcome recorded");
    reset();
    onOpenChange(false);
    onRecorded?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record outcome</DialogTitle>
          <DialogDescription>
            Capture a real-world result for <span className="text-foreground">{actorName}</span>.
            Outcomes feed back into re-verification judgement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>
            Programme <span className="text-destructive">*</span>
          </Label>
          <Select value={programmeId} onValueChange={setProgrammeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a programme…" />
            </SelectTrigger>
            <SelectContent>
              {programmes.length === 0 ? (
                <div className="p-2 text-sm text-foreground-muted">
                  You don't manage any programmes.
                </div>
              ) : (
                programmes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>
            Outcome type <span className="text-destructive">*</span>
          </Label>
          <RadioGroup
            value={outcomeType}
            onValueChange={(v) => setOutcomeType(v as OutcomeType)}
            className="flex gap-4 flex-wrap"
          >
            {OUTCOME_TYPES.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <RadioGroupItem value={t} id={`outcome-${t}`} />
                <Label htmlFor={`outcome-${t}`} className="font-normal cursor-pointer">
                  {OUTCOME_LABEL[t]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Completion date (optional)</Label>
          <Input
            type="date"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, scope, what happened…"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Evidence (optional, up to 3)</Label>
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
                  className="mt-1"
                  onClick={() =>
                    setEvidence((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {evidence.length < 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEvidence((prev) => [...prev, {}])}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add source
            </Button>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !programmeId || !outcomeType}
          >
            Record outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
