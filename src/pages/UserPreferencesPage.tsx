// AX4 + AX5 — Per-user default axis weight preferences with named presets.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AXIS_KEYS,
  AXIS_LABEL,
  SYSTEM_DEFAULT_WEIGHTS,
  useUserPreferences,
  type AxisWeights,
} from "@/hooks/useUserPreferences";
import { AXIS_WEIGHT_PRESETS, getPreset, matchingPreset } from "@/lib/axisWeightPresets";
import HelpHint from "@/components/ui/HelpHint";

type WeightMap = Record<keyof AxisWeights, number>;

const AXIS_HELP: Record<keyof AxisWeights, string> = {
  ontology: "How closely the actor's tagged capabilities, competences, domains, products and services overlap with your search.",
  geography: "Country match and distance from any specified city. Hard-filters when you set a country.",
  outcome: "Past engagement outcomes recorded against this actor across all programmes.",
  decay: "Freshness of verification. Recently verified actors score higher than stale or unverified ones.",
  capacity: "Team size and mobilisation speed signals captured on the actor.",
  certification: "Required and preferred certifications you specified in the search constraints.",
  engagement: "Your own past interactions with this actor (viewed, included, compared).",
};

function toSlider(w: WeightMap): WeightMap {
  return AXIS_KEYS.reduce((acc, k) => { acc[k] = Math.round(w[k] * 100); return acc; }, {} as WeightMap);
}
function fromSlider(s: WeightMap): WeightMap {
  return AXIS_KEYS.reduce((acc, k) => { acc[k] = s[k] / 100; return acc; }, {} as WeightMap);
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
  const activePreset = matchingPreset(fromSlider(sliders));

  const applyPreset = (id: string) => {
    const p = getPreset(id);
    if (!p) return;
    setSliders(toSlider(p.weights as WeightMap));
  };

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
          Set your default weighting across the seven ranking axes. Saved searches inherit these unless overridden.
          Weights are relative — they don't need to sum to 100.
        </p>
      </header>

      {/* AX5 — Preset dropdown */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-body-sm text-foreground">Start from a preset</Label>
          <HelpHint>Presets are starting points — adjust the sliders below to fine-tune. "Balanced" matches system defaults.</HelpHint>
        </div>
        <Select value={activePreset ?? ""} onValueChange={applyPreset}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={activePreset ? undefined : "Custom (no preset matches)"} />
          </SelectTrigger>
          <SelectContent>
            {AXIS_WEIGHT_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="space-y-0.5">
                  <div className="font-medium">{p.label}{activePreset === p.id && " · current"}</div>
                  <div className="text-caption text-foreground-muted">{p.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-caption text-foreground-muted">Loading…</p>}

      <div className="space-y-5">
        {AXIS_KEYS.map((k) => (
          <div key={k} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-body-sm text-foreground">{AXIS_LABEL[k]}</Label>
                <HelpHint>{AXIS_HELP[k]}</HelpHint>
              </div>
              <span className="font-mono text-mono-xs text-foreground-muted">
                {sliders[k]}
                <span className="text-foreground-muted/60"> / {Math.round((SYSTEM_DEFAULT_WEIGHTS[k] ?? 0) * 100)} default</span>
              </span>
            </div>
            <Slider
              value={[sliders[k]]}
              min={0} max={100} step={1}
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
