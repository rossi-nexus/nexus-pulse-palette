// AX4 — Per-user default axis weights for v2 RPC.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AxisWeights {
  ontology: number;
  geography: number;
  outcome: number;
  decay: number;
  capacity: number;
  certification: number;
  engagement: number;
}

export const SYSTEM_DEFAULT_WEIGHTS: AxisWeights = {
  ontology: 0.35,
  geography: 0.20,
  outcome: 0.15,
  decay: 0.10,
  capacity: 0.10,
  certification: 0.07,
  engagement: 0.03,
};

export const AXIS_KEYS: (keyof AxisWeights)[] = [
  "ontology", "geography", "outcome", "decay", "capacity", "certification", "engagement",
];

export const AXIS_LABEL: Record<keyof AxisWeights, string> = {
  ontology: "Ontology match",
  geography: "Geography",
  outcome: "Past outcomes",
  decay: "Verification freshness",
  capacity: "Capacity fit",
  certification: "Certifications",
  engagement: "Your engagement",
};

/**
 * Resolution order at query time:
 *   1. Saved-search override (passed by caller)
 *   2. User's default_axis_weights
 *   3. System defaults
 */
export function resolveAxisWeights(
  savedSearchOverride: Partial<AxisWeights> | null | undefined,
  userDefaults: Partial<AxisWeights> | null | undefined,
): AxisWeights | null {
  if (savedSearchOverride && Object.keys(savedSearchOverride).length > 0) {
    return { ...SYSTEM_DEFAULT_WEIGHTS, ...savedSearchOverride };
  }
  if (userDefaults && Object.keys(userDefaults).length > 0) {
    return { ...SYSTEM_DEFAULT_WEIGHTS, ...userDefaults };
  }
  return null; // tells RPC to use its own defaults
}

export function useUserPreferences() {
  const { user } = useAuth();
  const [weights, setWeights] = useState<Partial<AxisWeights> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setWeights(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("user_preferences")
      .select("default_axis_weights")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error && data) setWeights((data.default_axis_weights ?? null) as any);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(
    async (next: Partial<AxisWeights> | null) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("user_preferences")
        .upsert(
          { user_id: user.id, default_axis_weights: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      setWeights(next);
    },
    [user],
  );

  return { weights, loading, save, reload: load };
}
