import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/analytics/StatCard";
import { useAdminDashboard } from "@/hooks/useAdminDashboard";
import { AdminUtilitiesSection } from "@/components/admin/AdminUtilitiesSection";

const Row = ({ label, value }: { label: string; value: number | string }) => (
  <div className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2">
    <span className="text-body text-foreground truncate">{label}</span>
    <span className="text-foreground font-mono text-sm">{value}</span>
  </div>
);

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-h2 text-foreground">{children}</h2>
);

const AdminDashboardPage = () => {
  const { data, loading, error, refresh } = useAdminDashboard();

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted">
        Loading…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-body-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const queueEntries = Object.entries(data.validation_queue_by_status ?? {});
  const attrEntries = Object.entries(data.attribute_holders_by_kv ?? {});
  const topEvents = data.audit_top_event_types_7d ?? [];
  const registryEntries = Object.entries(data.registry_imports_by_action_30d ?? {});

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-[2.125rem] font-light tracking-[0.03em] leading-[1.2] text-foreground">
              Admin dashboard
            </h1>
            <p className="text-body-sm text-foreground-muted">
              System-wide signals across actors, verification, ontology, and audit activity.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </header>

        {/* Section 1 — Top stats */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="Verified actors"
            value={data.actor_verified}
            hint={`${data.actor_total} total`}
            tone="success"
          />
          <StatCard label="Unverified actors" value={data.actor_unverified} />
          <StatCard
            label="Decay overdue"
            value={data.decay_expired}
            tone={data.decay_expired > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Decay due 30d"
            value={data.decay_due_30d}
            tone={data.decay_due_30d > 0 ? "warning" : "default"}
          />
          <StatCard label="Programmes" value={data.programme_total} />
        </section>

        {/* Section 2 — Activity */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Verifications 7d" value={data.verification_events_7d} />
          <StatCard label="Verifications 30d" value={data.verification_events_30d} />
          <StatCard label="Ontology decisions 7d" value={data.ontology_decisions_7d} />
          <StatCard label="Ontology decisions 30d" value={data.ontology_decisions_30d} />
        </section>

        {/* Section 3 — Validation queue */}
        <section className="space-y-3">
          <SectionHeader>Validation queue</SectionHeader>
          {queueEntries.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">No queue activity.</p>
          ) : (
            <div className="space-y-1.5">
              {queueEntries.map(([status, c]) => (
                <Row key={status} label={status} value={c} />
              ))}
            </div>
          )}
        </section>

        {/* Section 4 — Ontology */}
        <section className="space-y-3">
          <SectionHeader>Ontology</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Active" value={data.ontology_active} />
            <StatCard
              label="Proposed"
              value={data.ontology_proposed}
              tone={data.ontology_proposed > 0 ? "warning" : "default"}
            />
            <StatCard label="Archived" value={data.ontology_archived} />
          </div>
        </section>

        {/* Section 5 — Users + attributes */}
        <section className="space-y-3">
          <SectionHeader>Users</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Users" value={data.user_total} />
            <StatCard label="Admins" value={data.user_admin} />
          </div>
          {attrEntries.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No active attribute grants.
            </p>
          ) : (
            <div className="space-y-1.5">
              {attrEntries.map(([kv, c]) => (
                <Row key={kv} label={kv} value={c} />
              ))}
            </div>
          )}
        </section>

        {/* Section 6 — Audit */}
        <section className="space-y-3">
          <SectionHeader>Audit log</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Events 7d" value={data.audit_events_7d} />
            <StatCard label="Events 30d" value={data.audit_events_30d} />
          </div>
          {topEvents.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No audit events in last 7 days.
            </p>
          ) : (
            <div className="space-y-1.5">
              {topEvents.map((t) => (
                <Row key={t.event_type} label={t.event_type} value={t.count} />
              ))}
            </div>
          )}
        </section>

        {/* Section 7 — Registry imports */}
        <section className="space-y-3">
          <SectionHeader>Registry imports (30d)</SectionHeader>
          {registryEntries.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No registry imports in last 30 days.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {registryEntries.map(([action, c]) => (
                <StatCard key={action} label={action} value={c} />
              ))}
            </div>
          )}
        </section>


        <AdminUtilitiesSection />
      </div>
    </div>
  );
};

export default AdminDashboardPage;
