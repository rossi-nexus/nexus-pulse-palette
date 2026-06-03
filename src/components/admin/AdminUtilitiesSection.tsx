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
  kind: "rpc" | "function";
  target: string; // rpc name or function name
  confirm: string;
  successFmt: (data: any) => string;
  // When true, pass the raw RPC response straight to successFmt (no count extraction).
  rawData?: boolean;
}

const UTILITIES: Utility[] = [
  {
    id: "backfill_descriptions",
    label: "Backfill actor descriptions",
    subtext:
      "Re-populates descriptions on actors that lack them by pulling from their original analysis_data. Safe to run multiple times.",
    kind: "rpc",
    target: "fn_backfill_actor_descriptions_from_personal",
    confirm: "Backfill descriptions for actors lacking them?",
    successFmt: (n) => `Backfilled descriptions for ${n ?? 0} actors`,
  },
  {
    id: "geocode_personal",
    label: "Backfill missing actor geocoding",
    subtext:
      "Geocodes personal actors that lack coordinates. Uses Nominatim — may take a few seconds per actor.",
    kind: "rpc",
    target: "fn_geocode_missing_personal_actors",
    confirm: "Geocode personal actors missing coordinates?",
    successFmt: (n) => `Geocoded ${n ?? 0} personal actors`,
  },
  {
    id: "geocode_verified",
    label: "Backfill missing verified actor geocoding",
    subtext:
      "Geocodes verified main-database actors that lack coordinates. Same Nominatim pipeline — one actor per call, loops client-side to avoid timeouts.",
    kind: "rpc",
    target: "fn_geocode_missing_verified_actors",
    confirm: "Geocode verified actors missing coordinates?",
    successFmt: (n) => `Geocoded ${n ?? 0} verified actors`,
  },
  {
    id: "backfill_ontology_confidence",
    label: "Backfill ontology tag confidence",
    subtext:
      "Fills the confidence rating on ontology tags that currently have none, based on existing evidence and source signals. Required by the AX3a multi-axis ranker. Safe to re-run.",
    kind: "rpc",
    target: "fn_backfill_ontology_tag_confidence",
    confirm: "Backfill confidence on all ontology tags currently unrated?",
    rawData: true,
    successFmt: (d: any) => {
      const r = Array.isArray(d) ? d[0] : d;
      if (!r) return "Confidence backfill complete";
      return `Confidence backfilled — updated ${r.rows_updated ?? 0} rows; ${r.rows_with_confidence ?? 0} tags now have explicit confidence.`;
    },
  },
  {
    id: "cleanup_drafts",
    label: "Cleanup old consultant drafts",
    subtext: "Deletes consultant_drafts rows older than 30 days.",
    kind: "rpc",
    target: "fn_cleanup_old_drafts",
    confirm: "Delete consultant drafts older than 30 days?",
    successFmt: (n) => `Deleted ${n ?? 0} old drafts`,
  },
  {
    id: "translate_to_english",
    label: "Translate Norwegian content to English",
    subtext:
      "Translates persisted actor descriptions, evidence, and roles from Norwegian to English. Safe to re-run — already-English rows are skipped.",
    kind: "function",
    target: "translate-actor-content",
    confirm:
      "Translate Norwegian content for all flagged rows? This may take a few seconds per row.",
    successFmt: (d: any) =>
      d
        ? `Translated: ${d.personal_actors_updated ?? 0} actors, ${d.personal_descriptions_translated ?? 0} descriptions, ${d.personal_fields_translated ?? 0} analysis fields, ${d.evidence_translated ?? 0} evidence, ${d.roles_translated ?? 0} roles${d.errors ? ` · ${d.errors} errors` : ""}`
        : "Translation complete",
  },
  {
    id: "backfill_provenance",
    label: "Backfill provenance labels",
    subtext:
      "Assigns source labels to legacy rows where source is unknown. Reads from existing data; does not modify content. Safe to re-run.",
    kind: "rpc",
    target: "fn_backfill_provenance_labels",
    confirm: "Backfill provenance labels for all rows with unknown source?",
    rawData: true,
    successFmt: (d: any) => {
      const r = Array.isArray(d) ? d[0] : d;
      if (!r) return "Provenance backfill complete";
      return `Provenance backfilled — descriptions: ${r.descriptions_updated ?? 0}, media: ${r.media_updated ?? 0}, contacts: ${r.contacts_updated ?? 0}, tags: ${r.tags_updated ?? 0} (total ${r.total_processed ?? 0})`;
    },
  },
  {
    id: "reprocess_auto_enrichment_media",
    label: "Reprocess auto-enrichment media",
    subtext:
      "Re-checks legacy auto-enrichment media against the current product-association rules. Orphans any image that no longer meets the rules (e.g., flag SVGs, partner brand assets). Original images are preserved — only the product linkage is cleared.",
    kind: "rpc",
    target: "fn_reprocess_auto_enrichment_media",
    confirm: "Re-check all auto-enrichment media against current rules?",
    rawData: true,
    successFmt: (d: any) => {
      const r = Array.isArray(d) ? d[0] : d;
      if (!r) return "Reprocess complete";
      return `Reprocessed — inspected: ${r.rows_inspected ?? 0}, orphaned: ${r.rows_orphaned ?? 0}, kept linked: ${r.rows_kept_linked ?? 0}`;
    },
  },
];

export const AdminUtilitiesSection = () => {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  // Live progress text for the geocoding loop — it's the only utility that
  // processes one row per call and needs inline progress feedback.
  const [geocodeProgress, setGeocodeProgress] = useState<string | null>(null);

  const pending = UTILITIES.find((u) => u.id === pendingId) ?? null;

  const extractErrorMessage = async (error: any, kind: "rpc" | "function"): Promise<string> => {
    if (!error) return "Unknown error";
    if (kind === "rpc") {
      const parts = [
        error.message,
        error.code ? `(code ${error.code})` : null,
        error.details,
        error.hint ? `hint: ${error.hint}` : null,
      ].filter(Boolean);
      return parts.join(" — ") || "Unknown RPC error";
    }
    const ctx = (error as any).context;
    if (ctx && typeof ctx === "object") {
      try {
        if (typeof ctx.json === "function") {
          const body = await ctx.json();
          const inner = body?.error || body?.message || JSON.stringify(body);
          return `${error.message ?? "Function error"} — ${inner}`;
        }
        if (typeof ctx.text === "function") {
          const txt = await ctx.text();
          if (txt) return `${error.message ?? "Function error"} — ${txt}`;
        }
        if (ctx.status) {
          return `${error.message ?? "Function error"} (HTTP ${ctx.status})`;
        }
      } catch {
        // fall through
      }
    }
    return error.message ?? "Unknown error";
  };

  // Special-case loop runner for the geocoding RPC, which now processes at most
  // one actor per call and returns {processed_count, remaining_count,
  // total_count, processed_actor_id, processed_actor_name}. Loops client-side
  // to avoid hitting the database statement timeout (audit §D2 / fix 1).
  const runGeocodeLoop = async (u: Utility) => {
    setGeocodeProgress("Counting candidates…");
    let totalKnown = 0;
    let totalProcessed = 0;
    for (let i = 0; i < 500; i++) {
      const { data, error } = await (supabase.rpc as any)(u.target);
      if (error) {
        const msg = await extractErrorMessage(error, "rpc");
        console.error(`[admin-utility] ${u.id} loop failed`, error);
        toast.error(`${u.label} failed: ${msg}`);
        setGeocodeProgress(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const processed = Number(row?.processed_count ?? 0);
      const remaining = Number(row?.remaining_count ?? 0);
      const total = Number(row?.total_count ?? 0);
      if (totalKnown === 0) totalKnown = total;
      totalProcessed += processed;
      if (processed === 0 && remaining === 0) break;
      setGeocodeProgress(
        `Geocoding ${totalProcessed} of ${totalKnown || totalProcessed + remaining} actors…`,
      );
      if (remaining === 0) break;
      // Brief breather between rows so the geocode-actor HTTP work has time
      // to land and we never hot-loop the database.
      await new Promise((r) => setTimeout(r, 200));
    }
    if (totalProcessed === 0) {
      toast.success("No actors needed geocoding.");
    } else {
      toast.success(`Geocoded ${totalProcessed} actor${totalProcessed === 1 ? "" : "s"}.`);
    }
    setGeocodeProgress(null);
  };

  const runUtility = async (u: Utility) => {
    setRunningId(u.id);
    try {
      if (u.id === "geocode_personal") {
        await runGeocodeLoop(u);
        return;
      }
      let data: any = null;
      let error: any = null;
      if (u.kind === "rpc") {
        const res = await (supabase.rpc as any)(u.target);
        data = res.data;
        error = res.error;
      } else {
        const res = await supabase.functions.invoke(u.target, { body: {} });
        data = res.data;
        error = res.error;
      }
      if (error) {
        const msg = await extractErrorMessage(error, u.kind);
        console.error(`[admin-utility] ${u.id} failed`, { kind: u.kind, target: u.target, error });
        toast.error(`${u.label} failed: ${msg}`);
        return;
      }
      if (u.kind === "rpc") {
        if (u.rawData) {
          toast.success(u.successFmt(data));
        } else {
          let count: number | null = null;
          if (typeof data === "number") count = data;
          else if (Array.isArray(data) && data.length > 0) {
            const v = data[0];
            if (typeof v === "number") count = v;
            else if (v && typeof v === "object") {
              count = data.length;
            } else {
              count = Number(v) || 0;
            }
          } else if (data != null) {
            count = Number(data) || 0;
          }
          toast.success(u.successFmt(count));
        }
      } else {
        toast.success(u.successFmt(data));
      }
    } catch (e: any) {
      console.error(`[admin-utility] ${u.id} threw`, e);
      toast.error(`${u.label} failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setRunningId(null);
      setPendingId(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-h2 text-foreground">Admin utilities</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
            {u.id === "geocode_personal" && runningId === u.id && geocodeProgress && (
              <p className="text-caption text-foreground-muted">{geocodeProgress}</p>
            )}
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
