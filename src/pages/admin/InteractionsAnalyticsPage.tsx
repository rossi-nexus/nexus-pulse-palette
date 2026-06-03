// AX5 — Admin analytics over user_actor_interactions (AX4).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/analytics/StatCard";
import { Skeleton } from "@/components/ui/skeleton";

interface Row {
  id: string;
  user_id: string;
  actor_id: string;
  interaction_type: string;
  created_at: string;
}

interface ActorMeta { id: string; legal_name: string }

const TYPES = ["result_viewed", "profile_opened", "included", "saved_for_later", "compared", "unincluded"] as const;

const InteractionsAnalyticsPage = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [actors, setActors] = useState<Map<string, string>>(new Map());
  const [outcomes, setOutcomes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 30 * 86400_000).toISOString();
        const { data, error } = await (supabase as any)
          .from("user_actor_interactions")
          .select("id,user_id,actor_id,interaction_type,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) throw error;
        const rs = (data ?? []) as Row[];
        setRows(rs);
        const ids = Array.from(new Set(rs.map((r) => r.actor_id)));
        if (ids.length > 0) {
          const { data: as } = await (supabase as any)
            .from("actors").select("id,legal_name").in("id", ids);
          const m = new Map<string, string>();
          (as ?? []).forEach((a: ActorMeta) => m.set(a.id, a.legal_name));
          setActors(m);
          // outcomes set — which actors have any recorded programme_outcomes
          const { data: os } = await (supabase as any)
            .from("programme_outcomes").select("actor_id").in("actor_id", ids);
          setOutcomes(new Set((os ?? []).map((o: any) => o.actor_id)));
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const cutoff7 = now - 7 * 86400_000;
    const r7 = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff7);
    const tally = (rs: Row[]) => {
      const by: Record<string, number> = {};
      for (const r of rs) by[r.interaction_type] = (by[r.interaction_type] ?? 0) + 1;
      return by;
    };
    return {
      total7: r7.length,
      total30: rows.length,
      distinctActors7: new Set(r7.map((r) => r.actor_id)).size,
      distinctActors30: new Set(rows.map((r) => r.actor_id)).size,
      distinctUsers7: new Set(r7.map((r) => r.user_id)).size,
      distinctUsers30: new Set(rows.map((r) => r.user_id)).size,
      byType7: tally(r7),
      byType30: tally(rows),
    };
  }, [rows]);

  const topActors = useMemo(() => {
    const tally = new Map<string, { total: number; byType: Record<string, number> }>();
    for (const r of rows) {
      const t = tally.get(r.actor_id) ?? { total: 0, byType: {} };
      t.total += 1;
      t.byType[r.interaction_type] = (t.byType[r.interaction_type] ?? 0) + 1;
      tally.set(r.actor_id, t);
    }
    return Array.from(tally.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [rows]);

  const funnel = useMemo(() => {
    const views = stats.byType30.result_viewed ?? 0;
    const opens = stats.byType30.profile_opened ?? 0;
    const inc = stats.byType30.included ?? 0;
    const outcomeActors = outcomes.size;
    return { views, opens, inc, outcomeActors };
  }, [stats, outcomes]);

  const funnelByActor = useMemo(() => {
    const byActor = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const a = byActor.get(r.actor_id) ?? {};
      a[r.interaction_type] = (a[r.interaction_type] ?? 0) + 1;
      byActor.set(r.actor_id, a);
    }
    const entries = Array.from(byActor.entries()).map(([id, c]) => ({
      id,
      views: c.result_viewed ?? 0,
      includes: c.included ?? 0,
      hasOutcome: outcomes.has(id),
    }));
    const lowConvert = entries
      .filter((e) => e.views >= 5 && e.includes / e.views < 0.05)
      .sort((a, b) => b.views - a.views).slice(0, 10);
    const noOutcome = entries
      .filter((e) => e.includes >= 2 && !e.hasOutcome)
      .sort((a, b) => b.includes - a.includes).slice(0, 10);
    return { lowConvert, noOutcome };
  }, [rows, outcomes]);

  const timeSeries = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      const b = buckets.get(d) ?? {};
      b[r.interaction_type] = (b[r.interaction_type] ?? 0) + 1;
      buckets.set(d, b);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const perUser = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of rows) tally.set(r.user_id, (tally.get(r.user_id) ?? 0) + 1);
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [rows]);

  const maxDailyTotal = useMemo(
    () => timeSeries.reduce((m, [, b]) => Math.max(m, Object.values(b).reduce((a, n) => a + n, 0)), 1),
    [timeSeries],
  );

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-80" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-body-sm text-destructive">{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-2">
        <h1 className="text-h2 font-medium text-foreground">No interactions yet</h1>
        <p className="text-body-sm text-foreground-muted">
          Once users view, open, or include actors during pipeline searches, activity will land here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
        <header className="border-b border-border-subtle pb-3">
          <h1 className="text-h2 font-medium text-foreground">Interactions analytics</h1>
          <p className="text-body-sm text-foreground-muted mt-1">User engagement signals captured by the closed-loop ranking system.</p>
        </header>

        {/* 1. Activity totals */}
        <section className="space-y-3">
          <h2 className="text-h3 text-foreground">Activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Interactions 7d" value={stats.total7} />
            <StatCard label="Interactions 30d" value={stats.total30} />
            <StatCard label="Distinct actors 30d" value={stats.distinctActors30} />
            <StatCard label="Active users 30d" value={stats.distinctUsers30} />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {TYPES.map((t) => (
              <div key={t} className="bg-surface border border-border rounded-md px-3 py-2">
                <div className="text-caption text-foreground-muted">{t.replace(/_/g, " ")}</div>
                <div className="font-mono text-body text-foreground">{stats.byType30[t] ?? 0}<span className="text-foreground-muted text-mono-xs"> · 7d {stats.byType7[t] ?? 0}</span></div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. Top actors */}
        <section className="space-y-3">
          <h2 className="text-h3 text-foreground">Top actors by interaction volume (30d)</h2>
          <div className="border border-border-subtle rounded-md overflow-hidden">
            <table className="w-full text-body-sm">
              <thead className="bg-elevated text-caption text-foreground-muted uppercase tracking-wider">
                <tr><th className="text-left px-3 py-2">Actor</th><th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Viewed</th><th className="text-right px-3 py-2">Opened</th><th className="text-right px-3 py-2">Included</th></tr>
              </thead>
              <tbody>
                {topActors.map((a) => (
                  <tr key={a.id} className="border-t border-border-subtle hover:bg-surface">
                    <td className="px-3 py-2">
                      <Link to={`/actors/${a.id}`} className="text-accent-teal hover:underline">{actors.get(a.id) ?? a.id.slice(0, 8)}</Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{a.total}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground-muted">{a.byType.result_viewed ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground-muted">{a.byType.profile_opened ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono text-accent-teal">{a.byType.included ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Conversion funnel */}
        <section className="space-y-3">
          <h2 className="text-h3 text-foreground">Conversion funnel (30d)</h2>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Viewed" value={funnel.views} />
            <StatCard label="Profile opened" value={funnel.opens} hint={funnel.views > 0 ? `${Math.round(100 * funnel.opens / funnel.views)}%` : undefined} />
            <StatCard label="Included" value={funnel.inc} hint={funnel.opens > 0 ? `${Math.round(100 * funnel.inc / funnel.opens)}%` : undefined} />
            <StatCard label="With outcome" value={funnel.outcomeActors} hint={funnel.inc > 0 ? `${Math.round(100 * funnel.outcomeActors / funnel.inc)}%` : undefined} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-border-subtle rounded-md p-3 space-y-2">
              <h3 className="text-body-sm font-medium text-foreground">Low view-to-include actors</h3>
              <p className="text-caption text-foreground-muted">Signal mismatch — profile may present poorly.</p>
              {funnelByActor.lowConvert.length === 0 ? (
                <p className="text-caption text-foreground-muted italic">None.</p>
              ) : (
                <ul className="space-y-1">
                  {funnelByActor.lowConvert.map((a) => (
                    <li key={a.id} className="flex justify-between text-body-sm">
                      <Link to={`/actors/${a.id}`} className="text-accent-teal hover:underline truncate">{actors.get(a.id) ?? a.id.slice(0, 8)}</Link>
                      <span className="font-mono text-foreground-muted">{a.includes}/{a.views}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border border-border-subtle rounded-md p-3 space-y-2">
              <h3 className="text-body-sm font-medium text-foreground">Included but no outcome recorded</h3>
              <p className="text-caption text-foreground-muted">Closed-loop signal missing — chase these.</p>
              {funnelByActor.noOutcome.length === 0 ? (
                <p className="text-caption text-foreground-muted italic">None.</p>
              ) : (
                <ul className="space-y-1">
                  {funnelByActor.noOutcome.map((a) => (
                    <li key={a.id} className="flex justify-between text-body-sm">
                      <Link to={`/actors/${a.id}`} className="text-accent-teal hover:underline truncate">{actors.get(a.id) ?? a.id.slice(0, 8)}</Link>
                      <span className="font-mono text-foreground-muted">{a.includes} incl</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* 4. Time series */}
        <section className="space-y-3">
          <h2 className="text-h3 text-foreground">Daily volume (30d)</h2>
          <div className="border border-border-subtle rounded-md p-3 overflow-x-auto">
            <div className="flex items-end gap-1 h-32 min-w-[600px]">
              {timeSeries.map(([day, b]) => {
                const total = Object.values(b).reduce((a, n) => a + n, 0);
                const h = Math.round((total / maxDailyTotal) * 100);
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${total}`}>
                    <div className="w-full bg-accent-teal/60 rounded-sharp" style={{ height: `${h}%`, minHeight: "2px" }} />
                    <span className="text-[9px] font-mono text-foreground-muted">{day.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5. Per-user */}
        <section className="space-y-3">
          <h2 className="text-h3 text-foreground">Most active users (30d)</h2>
          <div className="space-y-1">
            {perUser.map(([uid, n]) => (
              <div key={uid} className="flex items-center justify-between bg-surface border border-border-subtle rounded-md px-3 py-1.5">
                <span className="font-mono text-mono-xs text-foreground-muted truncate">{uid}</span>
                <span className="font-mono text-body-sm text-foreground">{n}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default InteractionsAnalyticsPage;
