// AX4 — Per-user default axis weight preferences.
// Layered: saved-search override → user defaults → system defaults.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  AXIS_KEYS,
  AXIS_LABEL,
  SYSTEM_DEFAULT_WEIGHTS,
  useUserPreferences,
  type AxisWeights,
} from "@/hooks/useUserPreferences";

type WeightMap = Record<keyof AxisWeights, number>;

function toSlider(w: WeightMap): WeightMap {
  // Display as 0-100 for slider, store as 0-1.
  return AXIS_KEYS.reduce((acc, k) => {
    acc[k] = Math.round(w[k] * 100);
    return acc;
  }, {} as WeightMap);
}
function fromSlider(s: WeightMap): WeightMap {
  return AXIS_KEYS.reduce((acc, k) => {
    acc[k] = s[k] / 100;
    return acc;
  }, {} as WeightMap);
}

const UserPreferencesPage = () => {
  const { weights, loading, save } = useUserPreferences();
  const initial: WeightMap = useMemo(() => {
    const base = { ...SYSTEM_DEFAULT_WEIGHTS, ...(weights ?? {}) };
    return toSlider(base as WeightMap);
  }, [weights]);
  const [sliders, setSliders] = useState<WeightMap>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSliders(initial); }, [initial]);

  const total = AXIS_KEYS.reduce((sum, k) => sum + sliders[k], 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(fromSlider(sliders));
      toast.success("Preferences saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await save(null);
      setSliders(toSlider(SYSTEM_DEFAULT_WEIGHTS as WeightMap));
      toast.success("Reset to system defaults");
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <header className="border-b border-border-subtle pb-4">
        <h1 className="text-h2 font-medium text-foreground">Ranking preferences</h1>
        <p className="text-body-sm text-foreground-muted mt-1">
          Set your default weighting across the six ranking axes. Saved searches inherit these unless overridden.
          Weights are relative — they don't need to sum to 100.
        </p>
      </header>

      {loading && <p className="text-caption text-foreground-muted">Loading…</p>}

      <div className="space-y-5">
        {AXIS_KEYS.map((k) => (
          <div key={k} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-body-sm text-foreground">{AXIS_LABEL[k]}</Label>
              <span className="font-mono text-mono-xs text-foreground-muted">
                {sliders[k]}
                <span className="text-foreground-muted/60"> / {Math.round((SYSTEM_DEFAULT_WEIGHTS[k] ?? 0) * 100)} default</span>
              </span>
            </div>
            <Slider
              value={[sliders[k]]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setSliders((prev) => ({ ...prev, [k]: v[0] }))}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle pt-4">
        <span className="text-caption text-foreground-muted">
          Total weight: <span className="font-mono text-foreground-secondary">{total}</span>
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleReset} disabled={saving}>
            Reset to system defaults
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserPreferencesPage;
