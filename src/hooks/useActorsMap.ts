import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ActorsMapEntry {
  id: string;
  legal_name: string;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_precision: "street" | "postal" | "city" | "country" | "failed" | null;
  verification_status: string | null;
  verified_at: string | null;
  decays_at: string | null;
  primary_domain_name: string | null;
  primary_domain_category: string | null;
}

export interface UseActorsMapResult {
  data: ActorsMapEntry[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useActorsMap(): UseActorsMapResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [data, setData] = useState<ActorsMapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!userId) {
      setData([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: rpcErr } = await (supabase.rpc as any)("fn_actors_for_map");
      if (cancelled) return;
      if (rpcErr) {
        const e = new Error(rpcErr.message);
        setError(e);
        toast.error(`Failed to load map data: ${rpcErr.message}`);
        setLoading(false);
        return;
      }
      const list = ((rows ?? []) as ActorsMapEntry[]).map((r) => ({
        ...r,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
      }));
      setData(list);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  return { data, loading, error, refresh };
}
