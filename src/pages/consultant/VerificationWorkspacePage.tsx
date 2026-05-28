// Phase 6.5.5b: verification workspace — replaces the placeholder.
// B4: adds "Complete & verify" mode wired to fn_approve_and_verify's
// p_consultant_decisions parameter. Gated to admins (RLS on analysis_data).
import { useMemo, useState } from "react";
import { ShieldCheck, AlertCircle, Loader2, CheckSquare, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVerificationQueue, type PendingSuggestion } from "@/hooks/useVerificationQueue";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useDuplicateScanner, type ActorDupCandidate } from "@/hooks/useDuplicateScanner";
import {
  ActorDuplicateComparison,
  type ActorComparisonResolution,
} from "@/components/verification/DuplicateComparisonView";
import {
  VerificationReviewDialog,
  type VerificationSubmitPayload,
} from "@/components/consultant/VerificationReviewDialog";
import {
  seedFromAnalysisData,
  emptyCompletionSeed,
  type CompletionDecision,
} from "@/components/consultant/CompleteAndVerifyBody";
import { ItemAdditionReviewDialog } from "@/components/consultant/ItemAdditionReviewDialog";

const VerificationWorkspacePage = () => {
  const { items, loading, refresh } = useVerificationQueue();
  const { hasAccess: isAdmin } = useAdminAccess();
  const [active, setActive] = useState<PendingSuggestion | null>(null);
  const [itemAddActive, setItemAddActive] = useState<PendingSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [conflictQueue, setConflictQueue] = useState<PendingSuggestion[]>([]);
  const [conflictIdx, setConflictIdx] = useState(0);
  const [candMap, setCandMap] = useState<Map<string, ActorDupCandidate[]>>(new Map());
  const { scanActors } = useDuplicateScanner();

  const toggleRow = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => {
    const allChosen = items.length > 0 && items.every((i) => selected.has(i.queue_id));
    setSelected(allChosen ? new Set() : new Set(items.map((i) => i.queue_id)));
  };
  const selectedRows = useMemo(
    () => items.filter((i) => selected.has(i.queue_id)),
    [items, selected],
  );

  const approveOne = async (
    row: PendingSuggestion,
    sharedNote: string | null,
  ): Promise<string | null> => {
    const { error } = await supabase.rpc("fn_approve_and_verify", {
      p_queue_id: row.queue_id,
      p_evidence: [] as unknown as never,
      p_decays_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
      p_confidence: "medium",
      p_notes: sharedNote || null,
      p_programme_id: row.programme_id ?? undefined,
    } as never);
    return error ? error.message : null;
  };

  const startBulkVerify = async () => {
    if (selectedRows.length === 0) return;
    setBulkBusy(true);
    try {
      const dupMap = await scanActors(
        selectedRows.map((r) => ({
          id: r.queue_id,
          legal_name: r.actor_name,
          org_number: r.org_number,
          country: r.country,
        })),
      );
      const conflicted = selectedRows.filter((r) => dupMap.has(r.queue_id));
      const clean = selectedRows.filter((r) => !dupMap.has(r.queue_id));

      let sharedNote: string | null = null;
      if (clean.length > 0) {
        sharedNote = window.prompt(
          `Verify ${clean.length} clean row${clean.length === 1 ? "" : "s"} with default settings (medium confidence, 90-day decay). Optional shared note:`,
          "",
        );
        if (sharedNote === null) {
          setBulkBusy(false);
          return;
        }
      }

      let ok = 0;
      const failures: Array<{ name: string; error: string }> = [];
      for (const row of clean) {
        const err = await approveOne(row, sharedNote);
        if (err) {
          failures.push({ name: row.actor_name, error: err });
          break;
        }
        ok++;
      }
      refresh();
      if (failures.length) {
        toast.error(
          `Verified ${ok}/${clean.length} — stopped at "${failures[0].name}": ${failures[0].error}`,
        );
        setBulkBusy(false);
        return;
      }
      if (ok > 0) toast.success(`Verified ${ok} actor${ok === 1 ? "" : "s"} cleanly`);

      if (conflicted.length > 0) {
        toast.warning(`${conflicted.length} potential duplicate${conflicted.length === 1 ? "" : "s"} — review each below.`);
        setCandMap(dupMap);
        setConflictQueue(conflicted);
        setConflictIdx(0);
      } else {
        setSelected(new Set());
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkReject = async () => {
    if (selectedRows.length === 0) return;
    const reason = window.prompt(
      `Reject ${selectedRows.length} suggestion${selectedRows.length === 1 ? "" : "s"}. Shared reason (applied to all):`,
      "",
    );
    if (reason === null) return;
    setBulkBusy(true);
    let ok = 0;
    const failures: Array<{ name: string; error: string }> = [];
    for (const row of selectedRows) {
      const { error } = await supabase.rpc("fn_reject_suggestion", {
        p_queue_id: row.queue_id,
        p_reason: reason || null,
        p_programme_id: row.programme_id ?? undefined,
      } as never);
      if (error) {
        failures.push({ name: row.actor_name, error: error.message });
        break;
      }
      ok++;
    }
    setBulkBusy(false);
    setSelected(new Set());
    refresh();
    if (failures.length) {
      toast.error(`Rejected ${ok}/${selectedRows.length} — stopped at "${failures[0].name}": ${failures[0].error}`);
    } else {
      toast.success(`Rejected ${ok} suggestion${ok === 1 ? "" : "s"}`);
    }
  };

  const resolveConflict = async (r: ActorComparisonResolution) => {
    const current = conflictQueue[conflictIdx];
    if (!current) return;
    setBulkBusy(true);
    try {
      if (r.kind === "new" || r.kind === "merge") {
        const err = await approveOne(current, null);
        if (err) {
          toast.error(`Verify failed for "${current.actor_name}": ${err}`);
          setConflictQueue([]);
          refresh();
          return;
        }
        if (r.kind === "merge") {
          // After verify, the queue row's linked actor exists; merge it into the chosen survivor.
          // We don't have the new actor id surfaced here, so we re-query via legal_name+org_number.
          const { data: newActor } = await supabase
            .from("actors")
            .select("id")
            .eq("legal_name", current.actor_name)
            .is("merged_into_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (newActor?.id && newActor.id !== r.survivorActorId) {
            const { error: mErr } = await supabase.rpc("fn_merge_actors", {
              p_survivor_id: r.survivorActorId,
              p_source_id: newActor.id,
              p_reason: "Bulk-verify duplicate resolution",
            } as never);
            if (mErr) {
              toast.error(`Merge failed for "${current.actor_name}": ${mErr.message}`);
            } else {
              toast.success(`Merged "${current.actor_name}" into selected survivor`);
            }
          }
        } else {
          toast.success(`Verified "${current.actor_name}" as new actor`);
        }
      }
    } finally {
      setBulkBusy(false);
    }
    const next = conflictIdx + 1;
    if (next >= conflictQueue.length) {
      setConflictQueue([]);
      setConflictIdx(0);
      setSelected(new Set());
      refresh();
    } else {
      setConflictIdx(next);
    }
  };

  const handleApprove = async (p: VerificationSubmitPayload) => {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_approve_and_verify", {
      p_queue_id: active.queue_id,
      p_evidence: p.evidence as unknown as never,
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

  const handleCompleteAndVerify = async (
    p: VerificationSubmitPayload,
    decisions: CompletionDecision[],
  ) => {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_approve_and_verify", {
      p_queue_id: active.queue_id,
      p_evidence: p.evidence as unknown as never,
      p_decays_at: p.decays_at,
      p_confidence: p.confidence,
      p_notes: p.notes || null,
      p_programme_id: active.programme_id,
      p_consultant_decisions: decisions as unknown as never,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `${active.actor_name} approved · ${decisions.length} ontology decision${decisions.length === 1 ? "" : "s"} recorded`,
    );
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
            {/* Sticky bulk action bar */}
            {selected.size > 0 && (
              <div className="sticky top-0 z-10 bg-elevated border border-primary/40 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 shadow-md">
                <span className="text-sm text-foreground font-medium">{selected.size} selected</span>
                <div className="flex-1" />
                <Button size="sm" disabled={bulkBusy} onClick={startBulkVerify}>
                  {bulkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify with merge check"}
                </Button>
                <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={bulkReject}>
                  Reject selected
                </Button>
                <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2 px-1 pb-1">
              <button
                onClick={toggleAll}
                className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
              >
                {items.length > 0 && items.every((i) => selected.has(i.queue_id)) ? (
                  <CheckSquare className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                Select all visible
              </button>
            </div>

            {items.map((it) => (
              <div key={it.queue_id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(it.queue_id)}
                  onChange={() => toggleRow(it.queue_id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-5 accent-primary"
                />
                <button
                  onClick={() =>
                    it.origin === "item_addition" ? setItemAddActive(it) : setActive(it)
                  }
                  className="flex-1 text-left bg-surface border border-border rounded-lg p-4 hover:border-border-accent hover:shadow-md transition-all"
                >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h3 className="font-semibold text-foreground text-base leading-tight truncate">
                      {it.actor_name || "Unnamed actor"}
                    </h3>
                    {it.origin === "registry_import" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-accent/10 text-accent border-accent/30 uppercase"
                      >
                        {it.origin_registry ?? "Registry"} import
                      </Badge>
                    ) : it.origin === "item_addition" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-primary/10 text-primary border-primary/30 uppercase"
                      >
                        Item addition · {it.proposed_items?.length ?? 0}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        User suggestion
                      </Badge>
                    )}
                    {it.matched_main_db_actor_id && it.origin === "user_suggestion" && (
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
                    {it.origin === "registry_import" ? "Imported by " : "Suggested by "}
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
              </div>
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
          completion={{
            actionLabel: "Complete & verify",
            submitLabel: "Save completion and verify",
            websiteUrl: active.actor_website ?? null,
            actorContext: { actor_name: active.actor_name, country: active.country },
            seed: active.analysis_data
              ? seedFromAnalysisData(active.analysis_data)
              : emptyCompletionSeed(),
            enabled: isAdmin,
            draftTarget: { targetType: "queue", targetId: active.queue_id },
            disabledReason: isAdmin
              ? undefined
              : "Admin only — non-admin consultants can't read full pipeline analysis for queued actors.",
            onSubmit: handleCompleteAndVerify,
          }}
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

      {conflictQueue.length > 0 && conflictQueue[conflictIdx] && (
        <ActorDuplicateComparison
          open
          onOpenChange={(o) => !o && setConflictQueue([])}
          incoming={{
            queue_id: conflictQueue[conflictIdx].queue_id,
            legal_name: conflictQueue[conflictIdx].actor_name,
            org_number: conflictQueue[conflictIdx].org_number,
            country: conflictQueue[conflictIdx].country,
            city: conflictQueue[conflictIdx].city,
            postal_code: null,
            street_address: conflictQueue[conflictIdx].street_address,
          }}
          candidates={candMap.get(conflictQueue[conflictIdx].queue_id) ?? []}
          index={conflictIdx + 1}
          total={conflictQueue.length}
          busy={bulkBusy}
          onResolve={resolveConflict}
        />
      )}
    </div>
  );
};

export default VerificationWorkspacePage;
