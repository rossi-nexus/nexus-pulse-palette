/**
 * "From your collection" panel — rendered on a verified DB actor profile
 * when the current user has a personal-collection actor whose
 * matched_main_db_actor_id points at this DB actor.
 *
 * Shows:
 *   - Personal notes (verbatim)
 *   - Personal tags (chips)
 *   - Per-category diff of ontology items in personal vs. DB, each with a
 *     "Suggest for verification" action that calls fn_propose_items_for_actor.
 *
 * Item additions are queue rows with origin='item_addition'. Accepted by a
 * consultant via fn_accept_item_addition, which inserts into
 * actor_ontology_tags on the existing DB actor (no new actor row created,
 * no verified_at change).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { readOntologyEntries, type DisplayEntry } from "@/lib/readOntologyEntries";
import { ProposeNewEntryDialog } from "./ProposeNewEntryDialog";

type CategoryKey = "capabilities" | "competences" | "domains" | "products" | "services";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  capabilities: "Capabilities",
  competences: "Competences",
  domains: "Domains",
  products: "Products",
  services: "Services",
};

// Map analysis_data section key → ontology_categories.type values that match.
const CATEGORY_TYPES: Record<CategoryKey, string[]> = {
  capabilities: ["capability"],
  competences: ["competence"],
  domains: ["domain"],
  products: ["product_type"],
  services: ["service_type"],
};

interface OntologyEntryLookupRow {
  id: string;
  raw_name: string;
  category_id: string | null;
  ontology_categories: { type: string } | null;
}

interface DbTagRow {
  ontology_entry_id: string;
  ontology_entries: {
    raw_name: string;
    ontology_categories: { type: string } | null;
  } | null;
}

interface DiffItem {
  /** Per-render stable key */
  key: string;
  category: CategoryKey;
  /** Resolved ontology entry id if the personal item name matches an existing entry. */
  ontologyEntryId: string | null;
  entryName: string;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
  sourceUrl?: string;
}

interface Props {
  dbActorId: string;
}

const norm = (s: string) => s.trim().toLowerCase();

export function FromYourCollectionPanel({ dbActorId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [personal, setPersonal] = useState<{
    id: string;
    notes: string | null;
    tags: string[] | null;
    analysis_data: Record<string, unknown> | null;
  } | null>(null);
  const [dbTags, setDbTags] = useState<DbTagRow[]>([]);
  const [entryLookup, setEntryLookup] = useState<OntologyEntryLookupRow[]>([]);
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [paRes, tagRes, entryRes] = await Promise.all([
        supabase
          .from("user_personal_actors")
          .select("id, notes, tags, analysis_data")
          .eq("user_id", user.id)
          .eq("matched_main_db_actor_id", dbActorId)
          .maybeSingle(),
        supabase
          .from("actor_ontology_tags")
          .select("ontology_entry_id, ontology_entries(raw_name, ontology_categories(type))")
          .eq("actor_id", dbActorId),
        supabase
          .from("ontology_entries")
          .select("id, raw_name, category_id, ontology_categories(type)")
          .eq("status", "active"),
      ]);
      if (paRes.error) throw paRes.error;
      if (tagRes.error) throw tagRes.error;
      if (entryRes.error) throw entryRes.error;
      setPersonal((paRes.data as any) ?? null);
      setDbTags((tagRes.data as any) ?? []);
      setEntryLookup((entryRes.data as any) ?? []);
    } catch (e: any) {
      toast.error(`Failed to load your collection data: ${e?.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [user, dbActorId]);

  useEffect(() => {
    load();
  }, [load]);

  const diffByCategory = useMemo<Record<CategoryKey, DiffItem[]>>(() => {
    const empty: Record<CategoryKey, DiffItem[]> = {
      capabilities: [],
      competences: [],
      domains: [],
      products: [],
      services: [],
    };
    if (!personal) return empty;
    const ad = (personal.analysis_data ?? {}) as Record<string, unknown>;

    // Index DB tags by (categoryType, normalizedName)
    const dbByCatName = new Set<string>();
    for (const t of dbTags) {
      const ct = t.ontology_entries?.ontology_categories?.type;
      const nm = t.ontology_entries?.raw_name;
      if (ct && nm) dbByCatName.add(`${ct}::${norm(nm)}`);
    }

    // Index resolvable ontology entries by (categoryType, normalizedName)
    const entryByCatName = new Map<string, string>(); // key → entry_id
    for (const e of entryLookup) {
      const ct = e.ontology_categories?.type;
      if (!ct) continue;
      entryByCatName.set(`${ct}::${norm(e.raw_name)}`, e.id);
    }

    const result = { ...empty };
    (Object.keys(empty) as CategoryKey[]).forEach((cat) => {
      const entries = readOntologyEntries(ad[cat]);
      const types = CATEGORY_TYPES[cat];
      const items: DiffItem[] = [];
      entries.forEach((e: DisplayEntry, idx) => {
        // Find which type this matches in DB (any of the allowed types)
        const matchInDb = types.some((t) => dbByCatName.has(`${t}::${norm(e.name)}`));
        if (matchInDb) return; // already in DB
        // Try resolve to an ontology entry id for proposal
        let entryId: string | null = null;
        for (const t of types) {
          const id = entryByCatName.get(`${t}::${norm(e.name)}`);
          if (id) {
            entryId = id;
            break;
          }
        }
        items.push({
          key: `${cat}-${idx}-${norm(e.name)}`,
          category: cat,
          ontologyEntryId: entryId,
          entryName: e.name,
          evidence: e.meta?.evidence ?? undefined,
          confidence: e.meta?.confidence ?? undefined,
          sourceUrl: e.meta?.source_url ?? undefined,
        });
      });
      result[cat] = items;
    });
    return result;
  }, [personal, dbTags, entryLookup]);

  const allDiffItems = useMemo(
    () => (Object.values(diffByCategory) as DiffItem[][]).flat(),
    [diffByCategory],
  );

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const proposeItems = useCallback(
    async (items: DiffItem[]) => {
      if (!personal || items.length === 0) return;
      const proposable = items.filter((i) => i.ontologyEntryId);
      const unresolved = items.length - proposable.length;
      if (proposable.length === 0) {
        toast.error("None of the selected items map to an existing ontology entry.");
        return;
      }
      setSubmitting(true);
      try {
        const payload = proposable.map((i) => ({
          ontology_entry_id: i.ontologyEntryId,
          entry_name: i.entryName,
          evidence: i.evidence ?? null,
          confidence: i.confidence ?? null,
          source_url: i.sourceUrl ?? null,
        }));
        const { error } = await (supabase as any).rpc("fn_propose_items_for_actor", {
          p_db_actor_id: dbActorId,
          p_personal_actor_id: personal.id,
          p_items: payload,
          p_reason: null,
        });
        if (error) throw error;
        toast.success(
          unresolved > 0
            ? `Suggested ${proposable.length} item${proposable.length === 1 ? "" : "s"} (${unresolved} skipped — no matching ontology entry).`
            : `Suggested ${proposable.length} item${proposable.length === 1 ? "" : "s"} for verification.`,
        );
        setSelected(new Set());
      } catch (e: any) {
        toast.error(`Failed to suggest: ${e?.message ?? "Unknown error"}`);
      } finally {
        setSubmitting(false);
      }
    },
    [dbActorId, personal],
  );

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-lg p-4 text-sm text-foreground-muted">
        Loading your collection data…
      </div>
    );
  }
  if (!personal) return null;

  const totalDiff = allDiffItems.length;
  const selectedItems = allDiffItems.filter((i) => selected.has(i.key));

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-4 h-4 text-foreground-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-muted" />
          )}
          <h3 className="text-base font-semibold text-foreground">From your collection</h3>
        </div>
        {totalDiff > 0 && (
          <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30">
            {totalDiff} item{totalDiff === 1 ? "" : "s"} not yet in DB
          </Badge>
        )}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-5">
          {/* Notes */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1">
              Your notes
            </div>
            {personal.notes && personal.notes.trim() ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{personal.notes}</p>
            ) : (
              <p className="text-sm text-foreground-muted italic">No personal notes.</p>
            )}
          </div>

          {/* Tags */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1">
              Your tags
            </div>
            {personal.tags && personal.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {personal.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted italic">No personal tags.</p>
            )}
          </div>

          {/* Diff items */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-[11px] uppercase tracking-wider text-foreground-muted">
                Items not yet in the verified DB
              </div>
              <div className="flex items-center gap-2">
                {totalDiff > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Suggest all ${totalDiff} item${totalDiff === 1 ? "" : "s"} for verification on this actor? They'll all flow through the verification queue at once.`,
                        )
                      ) {
                        proposeItems(allDiffItems);
                      }
                    }}
                  >
                    {submitting ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    Suggest all ({totalDiff})
                  </Button>
                )}
                {selectedItems.length > 0 && (
                  <Button
                    size="sm"
                    disabled={submitting}
                    onClick={() => proposeItems(selectedItems)}
                  >
                    {submitting ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Send className="w-3 h-3 mr-1" />
                    )}
                    Suggest {selectedItems.length} selected
                  </Button>
                )}
              </div>
            </div>

            {totalDiff === 0 ? (
              <p className="text-sm text-foreground-muted italic">
                Your collection has no additional items beyond what's in the verified DB.
              </p>
            ) : (
              <div className="space-y-3">
                {(Object.keys(diffByCategory) as CategoryKey[]).map((cat) => {
                  const items = diffByCategory[cat];
                  if (items.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="text-xs font-medium text-foreground-secondary mb-1.5">
                        {CATEGORY_LABELS[cat]}
                      </div>
                      <div className="space-y-1.5">
                        {items.map((item) => (
                          <div
                            key={item.key}
                            className="flex items-start gap-2 bg-elevated border border-border rounded-md px-3 py-2"
                          >
                            <Checkbox
                              checked={selected.has(item.key)}
                              onCheckedChange={() => toggle(item.key)}
                              disabled={!item.ontologyEntryId}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-foreground font-medium">
                                  {item.entryName}
                                </span>
                                {!item.ontologyEntryId && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-warning/10 text-warning border-warning/30"
                                  >
                                    No matching entry — can't suggest
                                  </Badge>
                                )}
                                {item.confidence && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.confidence}
                                  </Badge>
                                )}
                              </div>
                              {item.evidence && (
                                <p className="text-xs text-foreground-secondary mt-1 line-clamp-2">
                                  {item.evidence}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!item.ontologyEntryId || submitting}
                              onClick={() => proposeItems([item])}
                              className="text-xs"
                            >
                              Suggest
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
