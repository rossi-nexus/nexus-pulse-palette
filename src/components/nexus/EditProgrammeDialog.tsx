// Phase 6.5.5b: programme settings edit dialog (owner-only).
// Edits name / description / client_org / dates / status / deliverables_summary.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Programme, ProgrammeStatus } from "@/types/programme";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programme: Programme;
  onSaved: () => void;
}

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export const EditProgrammeDialog = ({ open, onOpenChange, programme, onSaved }: Props) => {
  const [name, setName] = useState(programme.name);
  const [description, setDescription] = useState(programme.description ?? "");
  const [clientOrg, setClientOrg] = useState(programme.client_org ?? "");
  const [startedAt, setStartedAt] = useState(dateInput(programme.started_at));
  const [endedAt, setEndedAt] = useState(dateInput(programme.ended_at));
  const [deliverables, setDeliverables] = useState(programme.deliverables_summary ?? "");
  const [status, setStatus] = useState<ProgrammeStatus>(programme.status as ProgrammeStatus);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(programme.name);
      setDescription(programme.description ?? "");
      setClientOrg(programme.client_org ?? "");
      setStartedAt(dateInput(programme.started_at));
      setEndedAt(dateInput(programme.ended_at));
      setDeliverables(programme.deliverables_summary ?? "");
      setStatus(programme.status as ProgrammeStatus);
    }
  }, [open, programme]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("programmes")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        client_org: clientOrg.trim() || null,
        started_at: startedAt ? new Date(startedAt).toISOString() : null,
        ended_at: endedAt ? new Date(endedAt).toISOString() : null,
        deliverables_summary: deliverables.trim() || null,
        status,
      })
      .eq("id", programme.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Programme updated");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit programme</DialogTitle>
          <DialogDescription>Update the programme's metadata.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Client organisation</Label>
            <Input value={clientOrg} onChange={(e) => setClientOrg(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Started at</Label>
              <Input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ended at</Label>
              <Input type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Deliverables summary</Label>
            <Textarea
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProgrammeStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
