// AX5 — Named weight presets so new users don't face seven blank sliders.
import type { AxisWeights } from "@/hooks/useUserPreferences";

export interface AxisWeightPreset {
  id: string;
  label: string;
  description: string;
  weights: AxisWeights;
}

export const AXIS_WEIGHT_PRESETS: AxisWeightPreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "System defaults. Reasonable across most search types.",
    weights: { ontology: 0.35, geography: 0.20, outcome: 0.15, decay: 0.10, capacity: 0.10, certification: 0.07, engagement: 0.03 },
  },
  {
    id: "geography_first",
    label: "Geography-first",
    description: "Location-critical procurements.",
    weights: { ontology: 0.25, geography: 0.40, outcome: 0.10, decay: 0.10, capacity: 0.07, certification: 0.05, engagement: 0.03 },
  },
  {
    id: "outcome_driven",
    label: "Outcome-driven",
    description: "Repeat actors where prior history matters most.",
    weights: { ontology: 0.30, geography: 0.10, outcome: 0.30, decay: 0.10, capacity: 0.10, certification: 0.07, engagement: 0.03 },
  },
  {
    id: "capability_pure",
    label: "Capability-pure",
    description: "Novel procurements where past outcomes are less predictive.",
    weights: { ontology: 0.55, geography: 0.10, outcome: 0.10, decay: 0.10, capacity: 0.05, certification: 0.05, engagement: 0.05 },
  },
  {
    id: "capacity_critical",
    label: "Capacity-critical",
    description: "Urgent procurements where mobilisation speed dominates.",
    weights: { ontology: 0.30, geography: 0.15, outcome: 0.10, decay: 0.05, capacity: 0.30, certification: 0.07, engagement: 0.03 },
  },
];

const EPS = 0.001;

/** Returns the preset id whose weights match `current` within tolerance, or null. */
export function matchingPreset(current: Partial<AxisWeights> | null | undefined): string | null {
  if (!current) return null;
  for (const p of AXIS_WEIGHT_PRESETS) {
    const same = (Object.keys(p.weights) as (keyof AxisWeights)[]).every(
      (k) => Math.abs((current[k] ?? 0) - p.weights[k]) < EPS,
    );
    if (same) return p.id;
  }
  return null;
}

export function getPreset(id: string): AxisWeightPreset | undefined {
  return AXIS_WEIGHT_PRESETS.find((p) => p.id === id);
}
