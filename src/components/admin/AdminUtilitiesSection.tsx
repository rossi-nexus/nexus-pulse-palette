// V3 batch #3 Area 3 — Admin operational utilities.
// Three buttons for one-shot maintenance RPCs. Admin-only (parent gates).
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

interface Utility {
  id: string;
  label: string;
  subtext: string;
  rpc: string;
  confirm: string;
  successFmt: (count: number | null) => string;
}

const UTILITIES: Utility[] = [
  {
    id: "backfill_descriptions",
    label: "Backfill actor descriptions",
    subtext:
      "Re-populates descriptions on actors that lack them by pulling from their original analysis_data. Safe to run multiple times.",
    rpc: "fn_backfill_actor_descriptions_from_personal",
    confirm: "Backfill descriptions for actors lacking them?",
    successFmt: (n) => `Backfilled descriptions for ${n ?? 0} actors`,
  },
  {
    id: "geocode_personal",
    label: "Backfill missing actor geocoding",
    subtext:
      "Geocodes personal actors that lack coordinates. Uses Nominatim — may take a few seconds per actor.",
    rpc: "fn_geocode_missing_personal_actors",
    confirm: "Geocode personal actors missing coordinates?",
    successFmt: (n) => `Geocoded ${n ?? 0} personal actors`,
  },
  {
    id: "cleanup_drafts",
    label: "Cleanup old consultant drafts",
    subtext: "Deletes consultant_drafts rows older than 30 days.",
    rpc: "fn_cleanup_old_drafts",
    confirm: "Delete consultant drafts older than 30 days?",
    successFmt: (n) => `Deleted ${n ?? 0} old drafts`,
  },
];

export const AdminUtilitiesSection = () => {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const pending = UTILITIES.find((u) => u.id === pendingId) ?? null;

  const runUtility = async (u: Utility) => {
    setRunningId(u.id);
    try {
      const { data, error } = await (supabase.rpc as any)(u.rpc);
      if (error) {
        toast.error(`${u.label} failed: ${error.message}`);
        return;
      }
      // RPCs may return a bare integer, a single row, or an array. Coerce.
      let count: number | null = null;
      if (typeof data === "number") count = data;
      else if (Array.isArray(data) && data.length > 0) {
        const v = data[0];
        count = typeof v === "number" ? v : Number(v) || 0;
      } else if (data != null) {
        count = Number(data) || 0;
      }
      toast.success(u.successFmt(count));
    } catch (e: any) {
      toast.error(`${u.label} failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setRunningId(null);
      setPendingId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-h2 text-foreground">Admin utilities</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {UTILITIES.map((u) => (
          <div
            key={u.id}
            className="bg-surface border border-border rounded-md p-4 flex flex-col gap-3"
          >
            <div className="space-y-1">
              <h3 className="text-body font-medium text-foreground">{u.label}</h3>
              <p className="text-body-sm text-foreground-muted leading-relaxed">{u.subtext}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-start mt-auto"
              disabled={runningId !== null}
              onClick={() => setPendingId(u.id)}
            >
              {runningId === u.id ? "Running…" : "Run"}
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPendingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && runUtility(pending)}>
              Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default AdminUtilitiesSection;
