import { useEffect, useMemo, useState } from "react";
import { Loader2, HelpCircle, Filter as FilterIcon, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOntologyQueue, type ProposedEntryRow } from "@/hooks/useOntologyQueue";
import ProposedEntryRowCard from "@/components/admin/ProposedEntryRow";
import { useDuplicateScanner, type OntologyDupCandidate } from "@/hooks/useDuplicateScanner";
import { OntologyDuplicateComparison, type OntologyComparisonResolution } from "@/components/verification/DuplicateComparisonView";

const HEADLINES = ["capability", "competence", "domain", "product_type", "service_type"] as const;
const AGES: Array<{ key: string; label: string; ms: number | null }> = [
  { key: "all", label: "All", ms: null },
  { key: "today", label: "Today", ms: 1 * 24 * 3600 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 3600 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 3600 * 1000 },
];

const HELP_TEXT = [
  ["Approve", "This is a real, distinct ontology entry. Add it to the canonical set."],
  ["Reject", "Not a real thing, or not worth keeping. Archive it; tags stay but the entry becomes invisible."],
  ["Edit", "Fix the name / description / category, then approve."],
  ["Merge", "This duplicates an existing entry. Re-point tags to the existing one, archive the duplicate."],
];

const PAGE_SIZE = 25;

const OntologyQueuePage = () => {
  const { items, loading, refresh } = useOntologyQueue();
  const [headlineFilter, setHeadlineFilter] = useState<Set<string>>(new Set());
  const [parentCatFilter, setParentCatFilter] = useState<Set<string>>(new Set());
  const [consultantFilter, setConsultantFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [sort, setSort] = useState<"newest" | "oldest" | "parent" | "consultant">("newest");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mergeQueue, setMergeQueue] = useState<ProposedEntryRow[]>([]);
  const [mergeIdx, setMergeIdx] = useState(0);
  const [mergeCandMap, setMergeCandMap] = useState<Map<string, Awaited<ReturnType<ReturnType<typeof useDuplicateScanner>["scanOntology"]>> extends Map<string, infer V> ? V : never>>(new Map());
  const { scanOntology } = useDuplicateScanner();

  useEffect(() => setPage(0), [headlineFilter, parentCatFilter, consultantFilter, actorFilter, ageFilter, actionFilter, sort]);
  useEffect(() => setSelected(new Set()), [headlineFilter, parentCatFilter, consultantFilter, actorFilter, ageFilter, actionFilter]);

  const consultantOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (it.consultant_user_id) map.set(it.consultant_user_id, it.consultant_name || it.consultant_email || it.consultant_user_id);
    }
    return Array.from(map.entries());
  }, [items]);

  const parentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (!headlineFilter.size || headlineFilter.has(it.headline)) {
        map.set(it.category_id, `${it.headline} / ${it.parent_category}`);
      }
    }
    return Array.from(map.entries());
  }, [items, headlineFilter]);

  const filtered = useMemo(() => {
    const ageMs = AGES.find((a) => a.key === ageFilter)?.ms ?? null;
    const now = Date.now();
    let out = items.filter((it) => {
      if (headlineFilter.size && !headlineFilter.has(it.headline)) return false;
      if (parentCatFilter.size && !parentCatFilter.has(it.category_id)) return false;
      if (consultantFilter && it.consultant_user_id !== consultantFilter) return false;
      if (actorFilter && !(it.source_actor_name ?? "").toLowerCase().includes(actorFilter.toLowerCase())) return false;
      if (actionFilter && it.produced_via !== actionFilter) return false;
      if (ageMs !== null) {
        const age = now - new Date(it.created_at).getTime();
        if (age > ageMs) return false;
      }
      return true;
    });
    if (sort === "newest") out = [...out].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    else if (sort === "oldest") out = [...out].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    else if (sort === "parent") out = [...out].sort((a, b) => a.parent_category.localeCompare(b.parent_category));
    else if (sort === "consultant") out = [...out].sort((a, b) => (a.consultant_name ?? "").localeCompare(b.consultant_name ?? ""));
    return out;
  }, [items, headlineFilter, parentCatFilter, consultantFilter, actorFilter, ageFilter, actionFilter, sort]);

  const last7Count = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return items.filter((i) => +new Date(i.created_at) >= cutoff).length;
  }, [items]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const toggleSetValue = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const clearFilters = () => {
    setHeadlineFilter(new Set());
    setParentCatFilter(new Set());
    setConsultantFilter("");
    setActorFilter("");
    setAgeFilter("all");
    setActionFilter("");
  };

  const anyFilter = headlineFilter.size || parentCatFilter.size || consultantFilter || actorFilter || ageFilter !== "all" || actionFilter;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-h1 text-foreground">Ontology queue</h1>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-foreground-muted hover:text-foreground" aria-label="Help">
                    <HelpCircle className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 text-xs space-y-2">
                  {HELP_TEXT.map(([k, v]) => (
                    <div key={k}>
                      <div className="font-semibold text-foreground">{k}</div>
                      <div className="text-foreground-muted">{v}</div>
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="text-body-sm text-foreground-muted mt-1">
              {items.length} proposed entries · {last7Count} added in last 7 days
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="h-8 bg-elevated border border-border rounded px-2 text-xs text-foreground"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="parent">By parent category</option>
              <option value="consultant">By consultant</option>
            </select>
          </div>
        </header>

        {/* Filters */}
        <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-foreground-muted">
            <FilterIcon className="w-3.5 h-3.5" /> Filters
            {anyFilter ? (
              <button onClick={clearFilters} className="ml-auto text-foreground-muted hover:text-foreground underline">
                Clear
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-foreground-muted mb-1">Headline</label>
              <div className="flex flex-wrap gap-1">
                {HEADLINES.map((h) => (
                  <button
                    key={h}
                    onClick={() => toggleSetValue(headlineFilter, h, setHeadlineFilter)}
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      headlineFilter.has(h)
                        ? "bg-primary/20 border-primary/40 text-foreground"
                        : "border-border text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-foreground-muted mb-1">Action</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="h-8 w-full bg-elevated border border-border rounded px-2 text-xs text-foreground"
              >
                <option value="">All actions</option>
                <option value="accept-as-new">accept-as-new</option>
                <option value="map-and-propose">map-and-propose</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-foreground-muted mb-1">Parent category</label>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {parentOptions.length === 0 ? (
                  <span className="text-xs text-foreground-muted italic">No categories in current selection</span>
                ) : (
                  parentOptions.map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => toggleSetValue(parentCatFilter, id, setParentCatFilter)}
                      className={`text-[10px] px-2 py-0.5 rounded border ${
                        parentCatFilter.has(id)
                          ? "bg-primary/20 border-primary/40 text-foreground"
                          : "border-border text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-foreground-muted mb-1">Consultant</label>
                <select
                  value={consultantFilter}
                  onChange={(e) => setConsultantFilter(e.target.value)}
                  className="h-8 w-full bg-elevated border border-border rounded px-2 text-xs text-foreground"
                >
                  <option value="">All consultants</option>
                  {consultantOptions.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-foreground-muted mb-1">Age</label>
                <select
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="h-8 w-full bg-elevated border border-border rounded px-2 text-xs text-foreground"
                >
                  {AGES.map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-foreground-muted mb-1">Source actor</label>
              <Input
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                placeholder="Filter by actor name…"
                className="h-8"
              />
            </div>
          </div>
        </section>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <p className="text-body">All caught up. The queue is empty.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-foreground-muted">
            <p className="text-body mb-3">No proposed entries match these filters.</p>
            <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {pageItems.map((it) => (
              <ProposedEntryRowCard key={it.id} entry={it} onDecision={refresh} />
            ))}
            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-3 text-xs text-foreground-muted">
                <div>
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span>Page {page + 1} of {totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default OntologyQueuePage;
