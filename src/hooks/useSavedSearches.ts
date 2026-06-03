import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SavedSearchRow {
  id: string;
  user_id: string;
  programme_id: string | null;
  name: string;
  need_payload: any;
  axis_weights: any | null;
  threshold: number;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSavedSearches() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SavedSearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("saved_searches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as SavedSearchRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(
    async (input: { name: string; need_payload: any; threshold: number; programme_id?: string | null }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await (supabase as any)
        .from("saved_searches")
        .insert({
          user_id: user.id,
          name: input.name,
          need_payload: input.need_payload,
          threshold: input.threshold,
          programme_id: input.programme_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      setRows((prev) => [data as SavedSearchRow, ...prev]);
      return data as SavedSearchRow;
    },
    [user],
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("saved_searches").delete().eq("id", id);
    if (error) throw error;
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const update = useCallback(async (id: string, patch: Partial<SavedSearchRow>) => {
    const { data, error } = await (supabase as any)
      .from("saved_searches")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    setRows((prev) => prev.map((r) => (r.id === id ? (data as SavedSearchRow) : r)));
    return data as SavedSearchRow;
  }, []);

  return { rows, loading, error, reload: load, create, remove, update };
}
