import { useState } from "react";
import { Link } from "react-router-dom";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { Button } from "@/components/ui/button";
import { Trash2, Play, Bell, Bookmark, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveAxisWeights, useUserPreferences } from "@/hooks/useUserPreferences";
import { Skeleton } from "@/components/ui/skeleton";
import { SAMPLE_SAVED_SEARCHES } from "@/lib/sampleSavedSearches";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400_000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(diff / 3600_000);
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(diff / 60_000);
  return `${m}m ago`;
}

const SavedSearchesPage = () => {
  const { rows, loading, remove, create } = useSavedSearches();
  const { user } = useAuth();
  const { weights: userDefaults } = useUserPreferences();
  const [running, setRunning] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, any[]>>({});

  const runNow = async (id: string, payload: any, override: any | null) => {
    setRunning(id);
    try {
      const entryIds: string[] = [];
      for (const r of payload?.roles ?? []) {
        for (const k of Object.keys(r.targets ?? {})) {
          for (const sel of r.targets[k] ?? []) {
            if (sel.ontology_entry_id) entryIds.push(sel.ontology_entry_id);
            else if (sel.entryId) entryIds.push(sel.entryId);
          }
        }
      }
      const uniq = Array.from(new Set(entryIds));
      const countries = payload?.constraints?.geography?.countries;
      const { data: rankRows, error: rankErr } = await (supabase.rpc as any)("fn_rank_actors_by_ontology_overlap", {
        p_entry_ids: uniq,
        p_limit: 20,
        p_countries: Array.isArray(countries) && countries.length > 0 ? countries.map((c: string) => c.toUpperCase()) : null,
      });
      if (rankErr) throw rankErr;
      const actorIds = (rankRows ?? []).map((r: any) => r.actor_id);
      if (actorIds.length === 0) {
        setRunResults((prev) => ({ ...prev, [id]: [] }));
        toast("No matches");
        return;
      }
      const resolved = resolveAxisWeights(override, userDefaults);
      const { data: scoreRows, error: scoreErr } = await (supabase.rpc as any)("fn_compute_actor_relevance_score_v2", {
        p_actor_ids: actorIds,
        p_constraints: { ontology_entry_ids: uniq, ...(payload?.constraints ?? {}) },
        p_weights: resolved,
        p_user_id: user?.id ?? null,
      });
      if (scoreErr) throw scoreErr;
      const byId = new Map<string, any>((scoreRows ?? []).map((s: any) => [s.actor_id as string, s]));
      const merged = (rankRows ?? []).map((r: any) => ({ ...r, ...(byId.get(r.actor_id) ?? {}) }));
      merged.sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0));
      setRunResults((prev) => ({ ...prev, [id]: merged }));
      toast.success(`${merged.length} actors ranked`);
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setRunning(null);
    }
  };

  const adopt = async (sample: typeof SAMPLE_SAVED_SEARCHES[number]) => {
    setAdopting(sample.id);
    try {
      await create({
        name: sample.name,
        need_payload: sample.need_payload,
        threshold: sample.threshold,
        programme_id: null,
      });
      toast.success(`Adopted "${sample.name}". Edit it any time.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Adopt failed");
    } finally {
      setAdopting(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <header className="flex items-center justify-between border-b border-border-subtle pb-3">
        <h1 className="text-h2 font-medium text-foreground">Saved searches</h1>
        <span className="text-caption text-foreground-muted">{rows.length} total</span>
      </header>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="space-y-5">
          <div className="text-center py-8 space-y-2 border border-dashed border-border-subtle rounded-card bg-surface">
            <Bookmark className="w-8 h-8 text-foreground-muted mx-auto" />
            <h2 className="text-body font-medium text-foreground">No saved searches yet</h2>
            <p className="text-body-sm text-foreground-muted max-w-md mx-auto">
              Save a search from any pipeline session via "Save this search", or adopt one of these starter templates below.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-caption text-foreground-muted uppercase tracking-wider">Sample searches</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SAMPLE_SAVED_SEARCHES.map((s) => (
                <div key={s.id} className="border border-border-subtle rounded-card bg-surface p-3 space-y-2 flex flex-col">
                  <h3 className="text-body-sm font-medium text-foreground">{s.name}</h3>
                  <p className="text-caption text-foreground-muted flex-1">{s.description}</p>
                  <p className="text-caption text-foreground-muted">Threshold <span className="font-mono">{s.threshold.toFixed(2)}</span></p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => adopt(s)}
                    disabled={adopting !== null}
                    className="gap-1.5"
                  >
                    <Plus className="w-3 h-3" />
                    {adopting === s.id ? "Adopting…" : "Adopt"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="border border-border rounded-card bg-surface p-4 space-y-2 animate-fade-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-body font-medium text-foreground">{r.name}</h3>
                <p className="text-caption text-foreground-muted">
                  Threshold <span className="font-mono">{Number(r.threshold).toFixed(2)}</span> · last notified {timeAgo(r.last_notified_at)} · created {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => runNow(r.id, r.need_payload, r.axis_weights ?? null)} disabled={running === r.id}>
                  <Play className="w-3 h-3 mr-1" /> {running === r.id ? "Running…" : "Run now"}
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => { try { await remove(r.id); toast.success("Deleted"); } catch (e: any) { toast.error(e?.message); } }}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {runResults[r.id] && (
              <div className="border-t border-border-subtle pt-2 space-y-1 animate-fade-in">
                <div className="text-caption text-foreground-muted">Top results</div>
                {runResults[r.id].slice(0, 5).map((a: any) => (
                  <div key={a.actor_id} className="flex items-center justify-between text-body-sm">
                    <Link to={`/actors/${a.actor_id}`} className="text-accent-teal hover:underline">{a.legal_name}</Link>
                    <span className="font-mono text-mono-xs">{Number(a.total_score ?? 0).toFixed(2)}</span>
                  </div>
                ))}
                {runResults[r.id].length === 0 && <p className="text-caption text-foreground-muted italic">No matches</p>}
              </div>
            )}
            <div className="flex items-center gap-2 text-caption text-foreground-muted">
              <Bell className="w-3 h-3" /> You'll be notified when a verified actor scores ≥ {Number(r.threshold).toFixed(2)}.
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SavedSearchesPage;
