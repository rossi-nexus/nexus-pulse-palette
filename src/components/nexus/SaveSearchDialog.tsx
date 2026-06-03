import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { useSavedSearches } from "@/hooks/useSavedSearches";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needPayload: any;
  programmeId?: string | null;
}

const SaveSearchDialog = ({ open, onOpenChange, needPayload, programmeId }: Props) => {
  const { create } = useSavedSearches();
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(0.7);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    try {
      await create({ name: name.trim(), need_payload: needPayload, threshold, programme_id: programmeId ?? null });
      toast.success("Search saved. You'll be notified when a new actor matches.");
      onOpenChange(false);
      setName("");
      setThreshold(0.7);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save this search</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nordic UAV providers" />
          </div>
          <div className="space-y-1.5">
            <Label>Notify when score ≥ <span className="font-mono">{threshold.toFixed(2)}</span></Label>
            <Slider value={[threshold]} onValueChange={(v) => setThreshold(v[0])} min={0.5} max={0.95} step={0.05} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save search</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveSearchDialog;
