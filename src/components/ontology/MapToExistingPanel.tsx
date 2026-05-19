import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MapToExistingResult {
  entry_id: string;
  entry_name: string;
  category_id: string;
  category_name: string;
}

interface OntoEntry {
  id: string;
  raw_name: string;
  category_id: string;
  category_name: string;
  category_keywords: string[] | null;
  category_examples: string[] | null;
  category_description: string | null;
}

interface Props {
  /** AI-proposed home category for this proposal. Search scopes here first, then co_occurring, then all. */
  proposedCategoryId: string | null;
  /** Cross-headline pairings — clicking a chip scopes the search to that category. */
  coOccurring: Array<{ id: string; name: string; type: string }>;
  /** Section_key from wizard, maps to ontology_categories.type for the search universe. */
  categoryType: "capability" | "competence" | "domain" | "product_type" | "service_type";
  onPick: (result: MapToExistingResult) => void;
  onCancel: () => void;
}

const TYPE_FROM_SECTION = {
  capabilities: "capability",
  competences: "competence",
  domains: "domain",
  products: "product_type",
  services: "service_type",
} as const;

export type SectionKeyForMap = keyof typeof TYPE_FROM_SECTION;

export const MapToExistingPanel = ({
  proposedCategoryId,
  coOccurring,
  categoryType,
  onPick,
  onCancel,
}: Props) => {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"primary" | "co" | "all" | string>(
    proposedCategoryId ? "primary" : "all",
  );
  const [entries, setEntries] = useState<OntoEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Pull all entries for this category-type + their parent metadata (one trip).
      const { data: cats } = await supabase
        .from("ontology_categories")
        .select("id, normalized_name, description, keywords, example_entries")
        .eq("type", categoryType)
        .eq("status", "active");
      const catMap = new Map<string, {
        normalized_name: string;
        description: string | null;
        keywords: string[] | null;
        example_entries: string[] | null;
      }>();
      for (const c of (cats ?? []) as Array<{
        id: string; normalized_name: string; description: string | null;
        keywords: string[] | null; example_entries: string[] | null;
      }>) {
        catMap.set(c.id, c);
      }
      const ids = Array.from(catMap.keys());
      const { data: ents } = ids.length
        ? await supabase
            .from("ontology_entries")
            .select("id, raw_name, category_id")
            .in("category_id", ids)
            .eq("status", "active")
            .order("raw_name")
        : { data: [] as Array<{ id: string; raw_name: string; category_id: string }> };
      if (cancelled) return;
      const rows: OntoEntry[] = (ents ?? []).map((e) => {
        const meta = catMap.get(e.category_id);
        return {
          id: e.id,
          raw_name: e.raw_name,
          category_id: e.category_id,
          category_name: meta?.normalized_name ?? "(unknown)",
          category_keywords: meta?.keywords ?? null,
          category_examples: meta?.example_entries ?? null,
          category_description: meta?.description ?? null,
        };
      });
      setEntries(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryType]);

  const coIds = useMemo(() => new Set(coOccurring.map((c) => c.id)), [coOccurring]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let scoped: OntoEntry[];
    if (scope === "primary" && proposedCategoryId) {
      scoped = entries.filter((e) => e.category_id === proposedCategoryId);
    } else if (scope === "co") {
      scoped = entries.filter((e) => coIds.has(e.category_id));
    } else if (scope === "all") {
      scoped = entries;
    } else {
      // scope is a specific co_occurring category id
      scoped = entries.filter((e) => e.category_id === scope);
    }
    if (!q) return scoped.slice(0, 50);
    return scoped
      .map((e) => {
        const nameHit = e.raw_name.toLowerCase().includes(q);
        const kwHit = (e.category_keywords ?? []).some((k) => k.toLowerCase().includes(q));
        const exHit = (e.category_examples ?? []).some((x) => x.toLowerCase().includes(q));
        const catHit = e.category_name.toLowerCase().includes(q);
        const score = (nameHit ? 4 : 0) + (catHit ? 2 : 0) + (kwHit ? 1 : 0) + (exHit ? 1 : 0);
        return { e, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.e);
  }, [entries, query, scope, proposedCategoryId, coIds]);

  return (
    <div className="border border-dashed border-border rounded-md p-3 space-y-2 bg-elevated/30">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          placeholder="Search by entry name, category, keyword…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          className="h-8"
        />
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 w-8 p-0">
          <XIcon className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {proposedCategoryId && (
          <button
            type="button"
            onClick={() => setScope("primary")}
            className={cn(
              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border",
              scope === "primary"
                ? "bg-primary/20 border-primary/40 text-foreground"
                : "border-border text-foreground-muted hover:text-foreground",
            )}
          >
            Proposed category
          </button>
        )}
        {coOccurring.length > 0 && (
          <button
            type="button"
            onClick={() => setScope("co")}
            className={cn(
              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border",
              scope === "co"
                ? "bg-primary/20 border-primary/40 text-foreground"
                : "border-border text-foreground-muted hover:text-foreground",
            )}
          >
            Paired
          </button>
        )}
        <button
          type="button"
          onClick={() => setScope("all")}
          className={cn(
            "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border",
            scope === "all"
              ? "bg-primary/20 border-primary/40 text-foreground"
              : "border-border text-foreground-muted hover:text-foreground",
          )}
        >
          All in section
        </button>
        {coOccurring.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setScope(c.id)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded border",
              scope === c.id
                ? "bg-accent/30 border-accent/60 text-foreground"
                : "border-border text-foreground-muted hover:text-foreground",
            )}
            title={`Paired category (${c.type})`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-4 flex items-center justify-center text-xs text-foreground-muted">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Loading entries…
        </div>
      ) : (
        <ul className="max-h-56 overflow-y-auto divide-y divide-border/60 rounded border border-border/60">
          {results.length === 0 ? (
            <li className="px-2 py-3 text-xs italic text-foreground-muted">No matches.</li>
          ) : (
            results.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      entry_id: e.id,
                      entry_name: e.raw_name,
                      category_id: e.category_id,
                      category_name: e.category_name,
                    })
                  }
                  className="w-full text-left px-2 py-1.5 hover:bg-elevated/60 flex items-baseline gap-2"
                >
                  <span className="text-sm font-mono text-foreground">{e.raw_name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                    {e.category_name}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
