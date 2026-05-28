import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ActorsMapEntry } from "@/hooks/useActorsMap";

interface PersonalRow {
  id: string;
  actor_name: string;
  country: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  geocoded_precision: string | null;
  matched_main_db_actor_id: string | null;
}

function mapRow(r: PersonalRow): ActorsMapEntry {
  return {
    id: r.id,
    legal_name: r.actor_name,
    country: r.country,
    city: r.city,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    geocoded_precision: (r.geocoded_precision as ActorsMapEntry["geocoded_precision"]) ?? null,
    verification_status: r.matched_main_db_actor_id ? "verified" : null,
    verified_at: null,
    decays_at: null,
    primary_domain_name: null,
    primary_domain_category: null,
  };
}

/**
 * Personal-collection actors discovered in a specific pipeline session.
 * Reads user_personal_actors WHERE source_session_id = sessionId AND owned by current user.
 */
export function useSessionActorsMap(sessionId: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<ActorsMapEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!user?.id || !sessionId) {
      setData([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: rows, error: qErr } = await supabase
        .from("user_personal_actors")
        .select(
          "id, actor_name, country, city, latitude, longitude, geocoded_precision, matched_main_db_actor_id",
        )
        .eq("user_id", user.id)
        .eq("source_session_id", sessionId);
      if (cancelled) return;
      if (qErr) {
        setError(new Error(qErr.message));
        setData([]);
        setLoading(false);
        return;
      }
      setData(((rows ?? []) as PersonalRow[]).map(mapRow));
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, sessionId, reloadKey]);

  return { data, loading, error, refresh };
}
