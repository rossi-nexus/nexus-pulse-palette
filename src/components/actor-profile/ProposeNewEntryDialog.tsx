// V3 — User-testing fix batch #2 / Area 1
// Dialog for handling a "From your collection" item that doesn't match an
// existing ontology entry. Three actions:
//   - Skip (just close)
//   - Map to existing entry (search dropdown within the category type)
//   - Propose as new ontology entry under category X (server-side RPC
//     creates a status='proposed' entry and queues an item_addition row)
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export type CategoryKey =
  | "capabilities"
  | "competences"
  | "domains"
  | "products"
  | "services";

const CATEGORY_TYPES: Record<CategoryKey, string[]> = {
  capabilities: ["capability"],
  competences: ["competence"],
  domains: ["domain"],
  products: ["product_type"],
  services: ["service_type"],
};

interface CategoryRow {
  id: string;
  normalized_name: string;
  type: string;
}

interface EntryRow {
  id: string;
  raw_name: string;
  category_id: string | null;
  ontology_categories: { type: string } | null;
}

interface ItemPayload {
  entryName: string;
  category: CategoryKey;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
  sourceUrl?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: ItemPayload | null;
  dbActorId: string;
  personalActorId: string;
  onDone: () => void;
}

export function ProposeNewEntryDialog({
  open,
  onOpenChange,
  item,
  dbActorId,
  personalActorId,
  onDone,
}: Props) {
  const [mode, setMode] = useState<"choose" | "map" | "new">("choose");
  const [submitting, setSubmitting] = useState(false);

  // Map state
  const [mapQuery, setMapQuery] = useState("");
  const [mapResults, setMapResults] = useState<EntryRow[]>([]);
  const [pickedEntry, setPickedEntry] = useState<EntryRow | null>(null);

  // New state
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [pickedCategoryId, setPickedCategoryId] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("choose");
      setMapQuery("");
      setMapResults([]);
      setPickedEntry(null);
      setPickedCategoryId(null);
      setNewDescription("");
    }
  }, [open]);

  const allowedTypes = useMemo(
    () => (item ? CATEGORY_TYPES[item.category] : []),
    [item],
  );

  useEffect(() => {
    if (!open || !item) return;
    setMapQuery(item.entryName);
    (async () => {
      const { data } = await supabase
        .from("ontology_categories")
        .select("id, normalized_name, type")
        .in("type", allowedTypes)
        .eq("status", "active")
        .order("normalized_name");
      const rows = (data as any as CategoryRow[]) ?? [];
      setCategories(rows);
      if (rows.length === 1) setPickedCategoryId(rows[0].id);
    })();
  }, [open, item, allowedTypes]);

  useEffect(() => {
    if (mode !== "map" || !item) return;
    const q = mapQuery.trim();
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("ontology_entries")
        .select("id, raw_name, category_id, ontology_categories(type)")
        .eq("status", "active")
        .order("raw_name")
        .limit(25);
      if (q.length > 0) query = query.ilike("raw_name", `%${q}%`);
      const { data } = await query;
      if (cancelled) return;
      const rows = ((data as any) ?? []).filter(
        (r: EntryRow) => r.ontology_categories && allowedTypes.includes(r.ontology_categories.type),
      );
      setMapResults(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, mapQuery, item, allowedTypes]);

  if (!item) return null;

  const handleMapSubmit = async () => {
    if (!pickedEntry) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("fn_propose_items_for_actor", {
        p_db_actor_id: dbActorId,
        p_personal_actor_id: personalActorId,
        p_items: [{
          ontology_entry_id: pickedEntry.id,
          entry_name: pickedEntry.raw_name,
          evidence: item.evidence ?? null,
          confidence: item.confidence ?? null,
          source_url: item.sourceUrl ?? null,
        }],
        p_reason: `Mapped "${item.entryName}" → "${pickedEntry.raw_name}"`,
      });
      if (error) throw error;
      toast.success(`Suggested "${pickedEntry.raw_name}" for verification.`);
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Failed to suggest: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewSubmit = async () => {
    if (!pickedCategoryId) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("fn_propose_new_entry_for_actor", {
        p_db_actor_id: dbActorId,
        p_personal_actor_id: personalActorId,
        p_entry_name: item.entryName,
        p_category_id: pickedCategoryId,
        p_description: newDescription.trim() || null,
        p_evidence: item.evidence ?? null,
        p_confidence: item.confidence ?? null,
        p_source_url: item.sourceUrl ?? null,
        p_reason: `Proposed new ontology entry "${item.entryName}"`,
      });
      if (error) throw error;
      toast.success(`Proposed new entry "${item.entryName}" and queued for this actor.`);
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Failed to propose: ${e?.message ?? "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-elevated border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            "{item.entryName}" — not in ontology yet
          </DialogTitle>
        </DialogHeader>

        {mode === "choose" && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-foreground-muted">
              This item from your collection doesn't match an existing{" "}
              <span className="font-medium text-foreground">{item.category}</span>{" "}
              ontology entry. Pick how to handle it:
            </p>
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => setMode("map")}>
                <Search className="w-4 h-4 mr-2" /> Map to existing entry
              </Button>
              <Button variant="outline" onClick={() => setMode("new")}>
                Propose as new ontology entry
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Skip — do nothing
              </Button>
            </div>
          </div>
        )}

        {mode === "map" && (
          <div className="space-y-3 py-2">
            <Input
              autoFocus
              value={mapQuery}
              onChange={(e) => setMapQuery(e.target.value)}
              placeholder="Search existing entries…"
              className="bg-surface border-border"
            />
            <div className="max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border bg-surface">
              {mapResults.length === 0 ? (
                <p className="text-xs italic text-foreground-muted p-3">No matches.</p>
              ) : (
                mapResults.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setPickedEntry(r)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-elevated ${
                      pickedEntry?.id === r.id ? "bg-elevated text-foreground" : "text-foreground-secondary"
                    }`}
                  >
                    {r.raw_name}
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode("choose")}>Back</Button>
              <Button disabled={!pickedEntry || submitting} onClick={handleMapSubmit}>
                {submitting && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Suggest mapping
              </Button>
            </DialogFooter>
          </div>
        )}

        {mode === "new" && (
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-foreground-muted">
                Category
              </label>
              <Select
                value={pickedCategoryId ?? undefined}
                onValueChange={(v) => setPickedCategoryId(v)}
              >
                <SelectTrigger className="bg-surface border-border mt-1">
                  <SelectValue placeholder="Pick a category…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.normalized_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-foreground-muted">
                Optional description
              </label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this entry mean? (helps admin reviewers)"
                rows={3}
                className="bg-surface border-border mt-1"
              />
            </div>
            <p className="text-xs text-foreground-muted">
              The entry will be created as <span className="font-mono">proposed</span> and queued
              alongside the suggestion to attach it to this actor. An admin will approve or
              rename it.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode("choose")}>Back</Button>
              <Button disabled={!pickedCategoryId || submitting} onClick={handleNewSubmit}>
                {submitting && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                Propose &amp; suggest
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
