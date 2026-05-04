// Phase 6.5.5b: verification workspace — replaces the placeholder.
import { useState } from "react";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useVerificationQueue, type PendingSuggestion } from "@/hooks/useVerificationQueue";
import {
  VerificationReviewDialog,
  type VerificationSubmitPayload,
} from "@/components/consultant/VerificationReviewDialog";

const VerificationWorkspacePage = () => {
  const { items, loading, refresh } = useVerificationQueue();
  const [active, setActive] = useState<PendingSuggestion | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async (p: VerificationSubmitPayload) => {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_approve_and_verify", {
      p_queue_id: active.queue_id,
      p_evidence: p.evidence,
      p_decays_at: p.decays_at,
      p_confidence: p.confidence,
      p_notes: p.notes || null,
      p_programme_id: active.programme_id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${active.actor_name} approved and verified`);
    setActive(null);
    refresh();
  };

  const handleReject = async (reason: string) => {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_reject_suggestion", {
      p_queue_id: active.queue_id,
      p_reason: reason || null,
      p_programme_id: active.programme_id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Suggestion rejected");
    setActive(null);
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Verification queue</h1>
            <p className="text-body-sm text-foreground-secondary mt-1">
              Review actors suggested by users. Approving an actor merges it to the main
              database and records a verification event.
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {items.length} {items.length === 1 ? "pending" : "pending"}
          </Badge>
        </header>

        {loading ? (
          <div className="text-foreground-muted text-sm">Loading queue…</div>
        ) : items.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-12 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-foreground-muted" />
            <h3 className="text-base font-medium text-foreground mb-2">
              Nothing waiting for review
            </h3>
            <p className="text-sm text-foreground-secondary max-w-md mx-auto">
              When users suggest actors from programmes you manage, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <button
                key={it.queue_id}
                onClick={() => setActive(it)}
                className="w-full text-left bg-surface border border-border rounded-lg p-4 hover:border-border-accent hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-foreground text-base leading-tight truncate">
                      {it.actor_name || "Unnamed actor"}
                    </h3>
                    {it.matched_main_db_actor_id && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-info/10 text-info border-info/30"
                      >
                        Matches existing
                      </Badge>
                    )}
                  </div>
                  {it.country && (
                    <span className="text-xs text-foreground-muted whitespace-nowrap">
                      {it.country}
                    </span>
                  )}
                </div>
                <div className="text-xs text-foreground-secondary flex items-center gap-2 flex-wrap">
                  <span>
                    Suggested by{" "}
                    <span className="text-foreground">
                      {it.suggested_by_name || it.suggested_by_email || "unknown"}
                    </span>
                  </span>
                  {it.suggested_at && (
                    <>
                      <span>·</span>
                      <span>{new Date(it.suggested_at).toLocaleDateString()}</span>
                    </>
                  )}
                  {it.programme_name ? (
                    <>
                      <span>·</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {it.programme_name}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertCircle className="w-3 h-3" /> Unscoped (admin only)
                      </span>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {active && (
        <VerificationReviewDialog
          open={!!active}
          onOpenChange={(o) => !o && setActive(null)}
          title={`Review ${active.actor_name}`}
          description="Capture evidence, set a decay window, and approve to merge into the main database — or reject."
          primaryLabel="Approve and verify"
          onApprove={handleApprove}
          onReject={handleReject}
          busy={busy}
          summary={
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-4">
              <dt className="text-foreground-muted">Name</dt>
              <dd className="text-foreground">{active.actor_name}</dd>
              {active.actor_description && (
                <>
                  <dt className="text-foreground-muted">Description</dt>
                  <dd className="text-foreground">{active.actor_description}</dd>
                </>
              )}
              {active.actor_website && (
                <>
                  <dt className="text-foreground-muted">Website</dt>
                  <dd className="text-foreground break-all">{active.actor_website}</dd>
                </>
              )}
              {active.country && (
                <>
                  <dt className="text-foreground-muted">Country</dt>
                  <dd className="text-foreground">{active.country}</dd>
                </>
              )}
              {active.org_number && (
                <>
                  <dt className="text-foreground-muted">Org no.</dt>
                  <dd className="text-foreground font-mono">{active.org_number}</dd>
                </>
              )}
              {(active.street_address || active.city || active.region) && (
                <>
                  <dt className="text-foreground-muted">Address</dt>
                  <dd className="text-foreground">
                    {[active.street_address, active.city, active.region]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                </>
              )}
              {active.trade_names.length > 0 && (
                <>
                  <dt className="text-foreground-muted">Trade names</dt>
                  <dd className="text-foreground">{active.trade_names.join(", ")}</dd>
                </>
              )}
            </dl>
          }
        />
      )}
    </div>
  );
};

export default VerificationWorkspacePage;
