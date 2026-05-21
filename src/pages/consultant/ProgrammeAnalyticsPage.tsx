import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import { useProgrammeAnalytics } from "@/hooks/useProgrammeAnalytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/analytics/StatCard";

const ConfidencePill = ({ c }: { c: "high" | "medium" | "low" | null }) => {
  if (!c) return null;
  const cls =
    c === "high"
      ? "bg-success/15 text-success"
      : c === "medium"
      ? "bg-info/15 text-info"
      : "bg-warning/15 text-warning";
  return <span className={`text-xs px-1.5 py-0.5 rounded ${cls}`}>{c}</span>;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const ProgrammeAnalyticsPage = () => {
  const { programmes, loading: progLoading } = useManagedProgrammes();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && programmes.length > 0) setSelected(programmes[0].id);
  }, [programmes, selected]);

  const { summary, activity, decay, members, loading } = useProgrammeAnalytics(selected);

  const selectedProg = useMemo(
    () => programmes.find((p) => p.id === selected),
    [programmes, selected],
  );

  if (progLoading) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted">
        Loading…
      </div>
    );
  }

  if (programmes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted">
        No managed programmes.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <header className="space-y-3">
          <h1 className="text-[2.125rem] font-light tracking-[0.03em] leading-[1.2] text-foreground">
            Programme analytics
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-muted">
              Programme
            </span>
            <Select value={selected ?? ""} onValueChange={setSelected}>
              <SelectTrigger className="w-[320px]">
                <SelectValue placeholder="Select a programme" />
              </SelectTrigger>
              <SelectContent>
                {programmes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.client_org ? ` — ${p.client_org}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProg && (
              <Link
                to={`/consultant/programmes/${selectedProg.id}`}
                className="text-accent-teal hover:underline text-xs flex items-center gap-1"
              >
                Open programme <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </header>

        {/* Top stats */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Sessions" value={summary.session_count} />
          <StatCard label="Members" value={summary.member_count} />
          <StatCard
            label="Verified actors"
            value={summary.verified_actor_count}
            tone="success"
          />
          <StatCard
            label="Pending suggestions"
            value={summary.pending_suggestion_count}
          />
          <StatCard
            label="Decay warnings"
            value={summary.decay_warning_count}
            tone={summary.decay_warning_count > 0 ? "warning" : "default"}
            hint="≤ 30 days"
          />
        </section>

        {/* Verification activity */}
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-success" />
            Recent verifications
          </h2>
          {loading ? (
            <p className="text-body-sm text-foreground-muted italic">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No verifications recorded for this programme yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {activity.map((a) => (
                <div
                  key={a.event_id}
                  className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <Link
                      to={`/actors/${a.actor_id}`}
                      className="text-body text-foreground hover:text-accent-teal truncate"
                    >
                      {a.actor_name}
                    </Link>
                    <span className="text-body-sm text-foreground-muted truncate">
                      by {a.verifier_name ?? "unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ConfidencePill c={a.confidence} />
                    <span className="text-xs text-foreground-muted">
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Decay warnings */}
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Decay warnings
          </h2>
          {decay.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No actors approaching expiry.
            </p>
          ) : (
            <div className="space-y-1.5">
              {decay.map((d) => (
                <div
                  key={d.actor_id}
                  className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <span className="text-body text-foreground truncate">
                      {d.actor_name}
                    </span>
                    <Badge
                      variant={d.state === "expired" ? "destructive" : "outline"}
                    >
                      {d.state === "expired"
                        ? `expired ${Math.abs(d.days_until)}d ago`
                        : `${d.days_until}d left`}
                    </Badge>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/actors/${d.actor_id}`}>Re-verify</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Member contributions */}
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground">Member contributions</h2>
          {members.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No members.
            </p>
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-body text-foreground truncate">
                      {m.user_name ?? m.user_id}
                    </span>
                    <Badge variant={m.role === "owner" ? "default" : "outline"}>
                      {m.role}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-foreground-muted shrink-0">
                    <span>
                      <span className="text-foreground font-mono">
                        {m.verifications_count}
                      </span>{" "}
                      verifications
                    </span>
                    <span>
                      <span className="text-foreground font-mono">
                        {m.suggestions_made_count}
                      </span>{" "}
                      suggestions
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProgrammeAnalyticsPage;
