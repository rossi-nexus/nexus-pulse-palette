import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import {
  AXIS_KEYS,
  AXIS_LABEL,
  SYSTEM_DEFAULT_WEIGHTS,
  useUserPreferences,
  type AxisWeights,
} from "@/hooks/useUserPreferences";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needPayload: any;
  programmeId?: string | null;
}

const SaveSearchDialog = ({ open, onOpenChange, needPayload, programmeId }: Props) => {
  const { create, update } = useSavedSearches();
  const { weights: userDefaults } = useUserPreferences();
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [inheritDefaults, setInheritDefaults] = useState(true);

  const effectiveDefaults = useMemo<AxisWeights>(
    () => ({ ...SYSTEM_DEFAULT_WEIGHTS, ...(userDefaults ?? {}) }),
    [userDefaults],
  );
  const [sliders, setSliders] = useState<Record<keyof AxisWeights, number>>(() =>
    AXIS_KEYS.reduce((acc, k) => { acc[k] = Math.round(effectiveDefaults[k] * 100); return acc; }, {} as any),
  );
  useEffect(() => {
    if (inheritDefaults) {
      setSliders(AXIS_KEYS.reduce((acc, k) => { acc[k] = Math.round(effectiveDefaults[k] * 100); return acc; }, {} as any));
    }
  }, [inheritDefaults, effectiveDefaults]);

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    try {
      const row = await create({ name: name.trim(), need_payload: needPayload, threshold, programme_id: programmeId ?? null });
      if (!inheritDefaults) {
        const axis_weights = AXIS_KEYS.reduce((acc, k) => { acc[k] = sliders[k] / 100; return acc; }, {} as any);
        await update(row.id, { axis_weights } as any);
      }
      toast.success("Search saved. You'll be notified when a new actor matches.");
      onOpenChange(false);
      setName("");
      setThreshold(0.7);
      setInheritDefaults(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

          <div className="border-t border-border-subtle pt-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={inheritDefaults} onCheckedChange={(v) => setInheritDefaults(!!v)} />
              <span className="text-body-sm text-foreground">Inherit my default axis weights</span>
            </label>
            <div className={inheritDefaults ? "opacity-50 pointer-events-none space-y-3" : "space-y-3"}>
              {AXIS_KEYS.map((k) => (
                <div key={k} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-caption text-foreground-secondary">{AXIS_LABEL[k]}</span>
                    <span className="font-mono text-mono-xs text-foreground-muted">{sliders[k]}</span>
                  </div>
                  <Slider
                    value={[sliders[k]]} min={0} max={100} step={1}
                    onValueChange={(v) => setSliders((p) => ({ ...p, [k]: v[0] }))}
                    disabled={inheritDefaults}
                  />
                </div>
              ))}
            </div>
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
