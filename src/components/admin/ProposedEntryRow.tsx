import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, X, Pencil, GitMerge, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapToExistingPanel } from "@/components/ontology/MapToExistingPanel";
import { similarity } from "@/lib/fuzzyMatch";
import type { ProposedEntryRow } from "@/hooks/useOntologyQueue";

interface FuzzyMatch {
  entry_id: string;
  raw_name: string;
  category_id: string;
  category_name: string;
  score: number;
}

interface Props {
  entry: ProposedEntryRow;
  onDecision: () => void;
}

const formatAge = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

const ProposedEntryRowCard = ({ entry, onDecision }: Props) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entry.raw_name);
  const [editDesc, setEditDesc] = useState(entry.description ?? "");
  const [editCatId, setEditCatId] = useState<string>(entry.category_id);
  const [editCatOptions, setEditCatOptions] = useState<Array<{ id: string; type: string; name: string }>>([]);
  const [merging, setMerging] = useState(false);
  const [fuzzy, setFuzzy] = useState<FuzzyMatch[]>([]);
  const [pendingMergeTarget, setPendingMergeTarget] = useState<FuzzyMatch | null>(null);

  // Load fuzzy matches when expanded
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // Pull active entries in same parent + co-occurring categories
      const { data: cats } = await supabase
        .from("ontology_categories")
        .select("id, normalized_name, co_occurring_category_ids, keywords, example_entries")
        .eq("id", entry.category_id)
        .maybeSingle();
      const coIds = ((cats?.co_occurring_category_ids ?? []) as string[]);
      const allCatIds = [entry.category_id, ...coIds];
      const { data: ents } = await supabase
        .from("ontology_entries")
        .select("id, raw_name, category_id")
        .in("category_id", allCatIds)
        .eq("status", "active");
      const { data: catRows } = await supabase
        .from("ontology_categories")
        .select("id, normalized_name")
        .in("id", allCatIds);
      const catNameMap = new Map<string, string>();
      for (const c of catRows ?? []) catNameMap.set(c.id, c.normalized_name);

      const proposalText = entry.raw_name;
      const parentKw = (cats?.keywords ?? []) as string[];
      const parentEx = (cats?.example_entries ?? []) as string[];

      const scored: FuzzyMatch[] = (ents ?? []).map((e: any) => {
        const nameSim = similarity(proposalText, e.raw_name);
        const substr = e.raw_name.toLowerCase().includes(proposalText.toLowerCase()) ||
          proposalText.toLowerCase().includes(e.raw_name.toLowerCase()) ? 0.3 : 0;
        const kwBoost = parentKw.some((k) => similarity(k, e.raw_name) > 0.5) ? 0.1 : 0;
        const exBoost = parentEx.some((x) => similarity(x, e.raw_name) > 0.5) ? 0.1 : 0;
        const score = Math.min(1, nameSim + substr + kwBoost + exBoost);
        return {
          entry_id: e.id,
          raw_name: e.raw_name,
          category_id: e.category_id,
          category_name: catNameMap.get(e.category_id) ?? "(unknown)",
          score,
        };
      }).filter((m) => m.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (!cancelled) setFuzzy(scored);
    })();
    return () => { cancelled = true; };
  }, [open, entry.category_id, entry.raw_name]);

  // Load category options for edit dropdown (same headline type only)
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ontology_categories")
        .select("id, type, normalized_name")
        .eq("type", entry.headline)
        .eq("status", "active")
        .order("normalized_name");
      if (!cancelled) {
        setEditCatOptions((data ?? []).map((c: any) => ({ id: c.id, type: c.type, name: c.normalized_name })));
      }
    })();
    return () => { cancelled = true; };
  }, [editing, entry.headline]);

  const callDecision = async (
    args: { action: string; reason?: string; raw_name?: string; description?: string; category_id?: string; target_entry_id?: string },
  ) => {
    setBusy(true);
    try {
      const { error } = await (supabase.rpc as any)("fn_admin_ontology_decision", {
        p_entry_id: entry.id,
        p_action: args.action,
        p_raw_name: args.raw_name ?? null,
        p_description: args.description ?? null,
        p_category_id: args.category_id ?? null,
        p_target_entry_id: args.target_entry_id ?? null,
        p_reason: args.reason ?? null,
      });
      if (error) throw error;
      toast.success(`'${entry.raw_name}' ${args.action}d`);
      onDecision();
    } catch (e: any) {
      toast.error(`Action failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy(false);
      setConfirm(null);
      setEditing(false);
      setMerging(false);
      setPendingMergeTarget(null);
    }
  };

  const coOccurringForMap = useMemo(() => {
    // Not needed beyond display; MapToExistingPanel uses categoryType to load universe
    return [] as Array<{ id: string; name: string; type: string }>;
  }, []);

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-3 p-4">
          <CollapsibleTrigger className="mt-1 text-foreground-muted hover:text-foreground">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </CollapsibleTrigger>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h3 className="text-h4 text-foreground font-mono">{entry.raw_name}</h3>
              <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                {entry.headline} / {entry.parent_category}
              </span>
            </div>
            {entry.description ? (
              <p className="text-body-sm text-foreground-secondary mt-1">{entry.description}</p>
            ) : (
              <p className="text-body-sm italic text-foreground-muted mt-1">(no description)</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-foreground-muted">
              {entry.produced_via ? (
                <span className="px-1.5 py-0.5 rounded border border-border bg-elevated/50">{entry.produced_via}</span>
              ) : null}
              <span>{formatAge(entry.created_at)}</span>
              {entry.consultant_name ? <span>· by {entry.consultant_name}</span> : null}
              {entry.source_actor_id ? (
                <span>
                  · from{" "}
                  <Link to={`/actors/${entry.source_actor_id}`} className="text-info hover:underline">
                    {entry.source_actor_name ?? "actor"}
                  </Link>
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" autoFocus onClick={() => setConfirm("approve")} disabled={busy}>
              <Check className="w-3.5 h-3.5" /> Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirm("reject")} disabled={busy}>
              <X className="w-3.5 h-3.5" /> Reject
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setEditing(true); }} disabled={busy}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setMerging(true); }} disabled={busy}>
              <GitMerge className="w-3.5 h-3.5" /> Merge
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4 py-4 space-y-4 bg-base/50">
            {/* Section 1: Proposal context */}
            <section>
              <h4 className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">Proposal context</h4>
              {editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] text-foreground-muted mb-1">Name</label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-foreground-muted mb-1">Description</label>
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Add a description before approving"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-foreground-muted mb-1">Parent category</label>
                    <select
                      value={editCatId}
                      onChange={(e) => setEditCatId(e.target.value)}
                      className="h-8 w-full bg-elevated border border-border rounded px-2 text-xs text-foreground"
                    >
                      {editCatOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={busy || !editName.trim()}
                      onClick={() =>
                        callDecision({
                          action: "edit",
                          raw_name: editName.trim(),
                          description: editDesc.trim() || undefined,
                          category_id: editCatId !== entry.category_id ? editCatId : undefined,
                        })
                      }
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save & approve"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-foreground-secondary space-y-1">
                  <div><span className="text-foreground-muted">Name:</span> <span className="font-mono">{entry.raw_name}</span></div>
                  <div><span className="text-foreground-muted">Category:</span> {entry.headline} / {entry.parent_category}</div>
                  <div>
                    <span className="text-foreground-muted">Description:</span>{" "}
                    {entry.description ?? <span className="italic text-foreground-muted">add a description before approving</span>}
                  </div>
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-foreground-muted hover:text-foreground">Parent category metadata</summary>
                    <div className="mt-1 pl-3 space-y-1 text-foreground-secondary">
                      {entry.parent_category_description ? <div>{entry.parent_category_description}</div> : null}
                      {entry.parent_category_keywords.length ? (
                        <div><span className="text-foreground-muted">Keywords:</span> {entry.parent_category_keywords.join(", ")}</div>
                      ) : null}
                      {entry.parent_category_examples.length ? (
                        <div><span className="text-foreground-muted">Examples:</span> {entry.parent_category_examples.join(", ")}</div>
                      ) : null}
                      {entry.parent_category_co_occurring.length ? (
                        <div><span className="text-foreground-muted">Co-occurring:</span> {entry.parent_category_co_occurring.join(", ")}</div>
                      ) : null}
                    </div>
                  </details>
                </div>
              )}
            </section>

            {/* Section 2: Original consultant decision */}
            <section>
              <h4 className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">Original consultant decision</h4>
              <div className="text-xs text-foreground-secondary space-y-1">
                {entry.consultant_name || entry.produced_via ? (
                  <div>
                    Proposed by <span className="text-foreground">{entry.consultant_name ?? "unknown"}</span>{" "}
                    on {new Date(entry.created_at).toLocaleString()} via{" "}
                    <span className="font-mono text-foreground">{entry.produced_via ?? "(unknown action)"}</span>
                  </div>
                ) : (
                  <div className="italic text-foreground-muted">No originating audit event found.</div>
                )}
                {entry.source_actor_id ? (
                  <div>
                    From onboarding of{" "}
                    <Link to={`/actors/${entry.source_actor_id}`} className="text-info hover:underline">
                      {entry.source_actor_name ?? "actor"}
                    </Link>
                  </div>
                ) : null}
                {entry.original_proposed_description ? (
                  <div><span className="text-foreground-muted">Original description:</span> {entry.original_proposed_description}</div>
                ) : null}
                {entry.audit_reason ? (
                  <div><span className="text-foreground-muted">Reason:</span> {entry.audit_reason}</div>
                ) : null}
                {entry.mapped_to_entry_id ? (
                  <div className="text-warning">
                    Consultant also mapped to:{" "}
                    <span className="font-mono">{entry.mapped_to_entry_name ?? entry.mapped_to_entry_id}</span>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Section 3: Similar existing entries */}
            <section>
              <h4 className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">Similar existing entries</h4>
              {fuzzy.length === 0 ? (
                <p className="text-xs italic text-foreground-muted">
                  No similar existing entries found in this category or co-occurring categories.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {fuzzy.map((m) => (
                    <li
                      key={m.entry_id}
                      className="flex items-center gap-2 bg-elevated/40 border border-border/60 rounded px-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-foreground truncate">{m.raw_name}</div>
                        <div className="text-[10px] text-foreground-muted">
                          {m.category_name} · similarity {(m.score * 100).toFixed(0)}%
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setPendingMergeTarget(m)}
                      >
                        <GitMerge className="w-3.5 h-3.5" /> Merge into this
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Merge search panel */}
            {merging ? (
              <section>
                <h4 className="text-[10px] uppercase tracking-wider text-foreground-muted mb-2">Search merge target</h4>
                <MapToExistingPanel
                  proposedCategoryId={entry.category_id}
                  coOccurring={coOccurringForMap}
                  categoryType={entry.headline}
                  onPick={(result) =>
                    setPendingMergeTarget({
                      entry_id: result.entry_id,
                      raw_name: result.entry_name,
                      category_id: result.category_id,
                      category_name: result.category_name,
                      score: 0,
                    })
                  }
                  onCancel={() => setMerging(false)}
                />
              </section>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Approve confirm */}
      <Dialog open={confirm === "approve"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve entry?</DialogTitle>
            <DialogDescription>
              Approve <span className="font-mono">{entry.raw_name}</span> as a canonical ontology entry under{" "}
              {entry.headline} / {entry.parent_category}.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional admin note"
            className="h-8"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => callDecision({ action: "approve", reason: reason || undefined })} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirm */}
      <Dialog open={confirm === "reject"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject entry?</DialogTitle>
            <DialogDescription>
              Archive <span className="font-mono">{entry.raw_name}</span>. Existing tags stay attached but the entry
              becomes invisible.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional reason"
            className="h-8"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={() => callDecision({ action: "reject", reason: reason || undefined })} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge confirm */}
      <Dialog open={!!pendingMergeTarget} onOpenChange={(o) => !o && setPendingMergeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge entry?</DialogTitle>
            <DialogDescription>
              Re-point all tags from <span className="font-mono">{entry.raw_name}</span> to{" "}
              <span className="font-mono">{pendingMergeTarget?.raw_name}</span> and archive{" "}
              <span className="font-mono">{entry.raw_name}</span>.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional admin note"
            className="h-8"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingMergeTarget(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() =>
                pendingMergeTarget &&
                callDecision({
                  action: "merge",
                  target_entry_id: pendingMergeTarget.entry_id,
                  reason: reason || undefined,
                })
              }
              disabled={busy}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProposedEntryRowCard;
