/**
 * ItemAdditionReviewDialog — consultant review surface for queue rows of
 * origin='item_addition'. Lists proposed items with per-item accept toggles
 * and inline edit on evidence/confidence, then calls fn_accept_item_addition
 * (or fn_reject_item_addition).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface ProposedItem {
  ontology_entry_id?: string | null;
  entry_name?: string | null;
  evidence?: string | null;
  confidence?: string | null;
  source_url?: string | null;
}

interface ItemRowState extends ProposedItem {
  key: string;
  accept: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueId: string;
  targetActorName: string;
  proposerName: string | null;
  proposedItems: ProposedItem[];
  onDone: () => void;
}

export function ItemAdditionReviewDialog({
  open,
  onOpenChange,
  queueId,
  targetActorName,
  proposerName,
  proposedItems,
  onDone,
}: Props) {
  const initial = useMemo<ItemRowState[]>(
    () =>
      proposedItems.map((p, idx) => ({
        ...p,
        key: `${idx}-${p.ontology_entry_id ?? p.entry_name ?? idx}`,
        accept: true,
      })),
    [proposedItems],
  );
  const [rows, setRows] = useState<ItemRowState[]>(initial);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  // Reset rows when dialog reopens with a different queueId.
  useEffect(() => {
    setRows(initial);
    setReason("");
  }, [initial, queueId]);

  const acceptedCount = rows.filter((r) => r.accept && r.ontology_entry_id).length;

  const handleAccept = async () => {
    if (acceptedCount === 0) {
      toast.error("Select at least one item to accept.");
      return;
    }
    setBusy(true);
    try {
      const accepted = rows
        .filter((r) => r.accept && r.ontology_entry_id)
        .map((r) => ({
          ontology_entry_id: r.ontology_entry_id,
          evidence: r.evidence ?? null,
          confidence: r.confidence ?? null,
          source_url: r.source_url ?? null,
        }));
      const { error } = await (supabase as any).rpc("fn_accept_item_addition", {
        p_queue_id: queueId,
        p_accepted_items: accepted,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success(`Added ${accepted.length} item${accepted.length === 1 ? "" : "s"} to ${targetActorName}.`);
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Accept failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("fn_reject_item_addition", {
        p_queue_id: queueId,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success("Item addition rejected.");
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Reject failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review item addition</DialogTitle>
          <DialogDescription>
            Items proposed for <span className="text-foreground">{targetActorName}</span>
            {proposerName ? <> by <span className="text-foreground">{proposerName}</span></> : null}.
            Accepting adds them to the verified DB actor without changing its verified status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {rows.length === 0 ? (
            <p className="text-sm text-foreground-muted italic">No items in this proposal.</p>
          ) : (
            rows.map((r, idx) => (
              <div
                key={r.key}
                className="border border-border rounded-md p-3 bg-elevated space-y-2"
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={r.accept}
                    onCheckedChange={(v) =>
                      setRows((rs) =>
                        rs.map((row, i) => (i === idx ? { ...row, accept: !!v } : row)),
                      )
                    }
                    disabled={!r.ontology_entry_id}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {r.entry_name ?? "(unnamed)"}
                      </span>
                      {!r.ontology_entry_id && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-warning/10 text-warning border-warning/30"
                        >
                          Unresolved entry — cannot accept
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pl-6 grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                  <Textarea
                    placeholder="Evidence"
                    rows={2}
                    value={r.evidence ?? ""}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((row, i) =>
                          i === idx ? { ...row, evidence: e.target.value } : row,
                        ),
                      )
                    }
                    className="text-xs"
                  />
                  <Input
                    placeholder="Confidence"
                    value={r.confidence ?? ""}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((row, i) =>
                          i === idx ? { ...row, confidence: e.target.value } : row,
                        ),
                      )
                    }
                    className="text-xs"
                  />
                </div>
                {r.source_url && (
                  <div className="pl-6 text-[11px] text-foreground-muted truncate">
                    Source: {r.source_url}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mt-4 space-y-3">
          <Textarea
            placeholder="Optional reason / notes (recorded on the queue row)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="secondary" disabled={busy} onClick={handleReject}>
              Reject all
            </Button>
            <Button disabled={busy || acceptedCount === 0} onClick={handleAccept}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Accept {acceptedCount} item{acceptedCount === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
