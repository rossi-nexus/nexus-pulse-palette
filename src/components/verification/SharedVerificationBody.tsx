// Profile-3 / D-unify-a: canonical body for both flows that produce a verified
// actor with consultant-curated ontology:
//   - VerificationReviewDialog (registry import + re-verify) — mode 'from-queue' | 're-verify'
//   - OnboardingPage Step 2 (direct onboarding) — mode 'fresh'
//
// Preserves B2 follow-ups:
//   - URL pre-fill precedence: urlSeed (record) → evidenceSeed (first evidence) → empty
//   - Mirror-on-blur of enrichment URL back into evidence (parent supplies handler)
//
// Adds a "Scrape all sections" primary action (lifted from OnboardingPage) that
// fires per-section scrape calls when at least one section is not_started.
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Check, X as XIcon, Sparkles, CircleDashed, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProposedNewCard } from "@/components/ontology/ProposedNewCard";
import { ProposalReviewList, type ReviewProposal } from "@/components/nexus/ProposalReviewList";
import type { MapToExistingResult } from "@/components/ontology/MapToExistingPanel";
import {
  useDraftPersistence,
  timeAgo,
  type DraftTarget,
} from "@/hooks/useDraftPersistence";

// ---------- Public types (re-exported from CompleteAndVerifyBody for back-compat) ----------

export type CompletionAction = "map-to-existing" | "accept-as-new" | "map-and-propose" | "reject";

export interface CompletionDecision {
  action: CompletionAction;
  proposed_name: string;
  proposed_category_id: string | null;
  mapped_to_entry_id: string | null;
  mapped_to_entry_name?: string | null;
  proposed_description?: string | null;
}

export type SectionKey = "capabilities" | "competences" | "domains" | "products" | "services";

export interface SectionDef {
  key: SectionKey;
  label: string;
  ontoType: "capability" | "competence" | "domain" | "product_type" | "service_type";
}

/** Single source of truth for the five sections (was duplicated in onboarding + C&V). */
export const SECTIONS: SectionDef[] = [
  { key: "capabilities", label: "Capabilities", ontoType: "capability" },
  { key: "competences", label: "Competences", ontoType: "competence" },
  { key: "domains", label: "Domains", ontoType: "domain" },
  { key: "products", label: "Product types", ontoType: "product_type" },
  { key: "services", label: "Service types", ontoType: "service_type" },
];

export interface SeedPill {
  entry_name: string;
  ontology_entry_id?: string | null;
  status?: "active" | "proposed" | string | null;
}

export type CompletionSeed = Record<SectionKey, SeedPill[]>;

export const emptyCompletionSeed = (): CompletionSeed => ({
  capabilities: [], competences: [], domains: [], products: [], services: [],
});

interface ProposedCategoryMeta {
  id: string;
  normalized_name: string;
  description: string | null;
  keywords: string[];
  example_entries: string[];
  co_occurring: Array<{ id: string; name: string; type: string }>;
}

interface EnrichedProposal extends ReviewProposal {
  matched_entry_id: string | null;
  is_proposed_new: boolean;
  proposed_category_id: string | null;
  proposed_category_meta: ProposedCategoryMeta | null;
}

type SectionState = {
  loading: boolean;
  error: string | null;
  proposals: EnrichedProposal[];
  acceptedNames: string[];
  decisions: CompletionDecision[];
  scraped: boolean;
};

const emptySection = (): SectionState => ({
  loading: false, error: null, proposals: [], acceptedNames: [], decisions: [], scraped: false,
});

// ---------- Seed helpers (kept here so CompleteAndVerifyBody re-exports stay valid) ----------

export function flattenAnalysisSection(value: unknown): SeedPill[] {
  if (!Array.isArray(value)) return [];
  const out: SeedPill[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      const n = item.trim();
      if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push({ entry_name: n }); }
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const entries = Array.isArray(obj.entries) ? (obj.entries as Array<Record<string, unknown>>) : null;
      if (entries) {
        for (const e of entries) {
          const n = typeof e.entryName === "string" ? e.entryName.trim()
                  : typeof e.entry_name === "string" ? (e.entry_name as string).trim()
                  : typeof e.name === "string" ? (e.name as string).trim() : "";
          if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push({ entry_name: n }); }
        }
      } else {
        const n = typeof obj.entry_name === "string" ? obj.entry_name.trim()
                : typeof obj.entryName === "string" ? (obj.entryName as string).trim()
                : typeof obj.name === "string" ? (obj.name as string).trim() : "";
        if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push({ entry_name: n }); }
      }
    }
  }
  return out;
}

export function seedFromAnalysisData(analysis: Record<string, unknown> | null | undefined): CompletionSeed {
  const a = analysis ?? {};
  return {
    capabilities: flattenAnalysisSection(a.capabilities),
    competences: flattenAnalysisSection(a.competences),
    domains: flattenAnalysisSection(a.domains),
    products: flattenAnalysisSection(a.products ?? (a as Record<string, unknown>).productTypes),
    services: flattenAnalysisSection(a.services ?? (a as Record<string, unknown>).serviceTypes),
  };
}

// ---------- Props ----------

export type SharedVerificationMode = "fresh" | "from-queue" | "re-verify";

type UrlPrefillSource = "record" | "evidence" | "typed" | "empty";

interface Props {
  mode: SharedVerificationMode;
  actorContext: { actor_name: string; country: string | null };
  /** Pre-seeded pills per section (empty in 'fresh' mode by default). */
  seed?: CompletionSeed;
  /** Record-level website (highest URL precedence). */
  urlSeed?: string | null;
  /** First evidence-source URL (mid URL precedence). */
  evidenceSeed?: string | null;
  /** Reserved for Profile-8 draft restore; currently unused. */
  initialDecisions?: CompletionDecision[];
  /** Mirror-on-blur hook — parent appends the URL into its evidence list. */
  onEnrichmentUrlCommit?: (url: string) => void;
  onChange: (payload: {
    decisions: CompletionDecision[];
    removedExistingTagIds: string[];
  }) => void;
}

export const SharedVerificationBody = ({
  mode: _mode,
  actorContext,
  seed,
  urlSeed,
  evidenceSeed,
  onEnrichmentUrlCommit,
  onChange,
}: Props) => {
  const effectiveSeed: CompletionSeed = seed ?? emptyCompletionSeed();

  // ---------- URL precedence: record → evidence → empty ----------
  const initialUrl = (urlSeed && urlSeed.trim())
    || (evidenceSeed && evidenceSeed.trim())
    || "";
  const initialSource: UrlPrefillSource = urlSeed && urlSeed.trim()
    ? "record"
    : evidenceSeed && evidenceSeed.trim()
      ? "evidence"
      : "empty";
  const [urlDraft, setUrlDraft] = useState<string>(initialUrl);
  const [urlSource, setUrlSource] = useState<UrlPrefillSource>(initialSource);

  const commitEnrichmentUrl = () => {
    const u = urlDraft.trim();
    if (!u || !/^https?:\/\//i.test(u)) return;
    onEnrichmentUrlCommit?.(u);
  };

  const [sections, setSections] = useState<Record<SectionKey, SectionState>>(() => {
    const s = {} as Record<SectionKey, SectionState>;
    for (const def of SECTIONS) {
      s[def.key] = { ...emptySection(), acceptedNames: effectiveSeed[def.key].map((p) => p.entry_name) };
    }
    return s;
  });
  const [removedSeedNames, setRemovedSeedNames] = useState<Record<SectionKey, string[]>>({
    capabilities: [], competences: [], domains: [], products: [], services: [],
  });
  const [manualDrafts, setManualDrafts] = useState<Record<SectionKey, string | null>>({
    capabilities: null, competences: null, domains: null, products: null, services: null,
  });

  const seedTagIds = useMemo(() => {
    const map: Record<SectionKey, Map<string, string | null>> = {
      capabilities: new Map(), competences: new Map(), domains: new Map(), products: new Map(), services: new Map(),
    };
    for (const def of SECTIONS) {
      for (const p of effectiveSeed[def.key]) map[def.key].set(p.entry_name, p.ontology_entry_id ?? null);
    }
    return map;
  }, [effectiveSeed]);

  const seedStatus = useMemo(() => {
    const map: Record<SectionKey, Map<string, string | null>> = {
      capabilities: new Map(), competences: new Map(), domains: new Map(), products: new Map(), services: new Map(),
    };
    for (const def of SECTIONS) {
      for (const p of effectiveSeed[def.key]) if (p.status) map[def.key].set(p.entry_name, p.status);
    }
    return map;
  }, [effectiveSeed]);

  useEffect(() => {
    const decisions: CompletionDecision[] = [];
    const removedExistingTagIds: string[] = [];
    for (const def of SECTIONS) {
      decisions.push(...sections[def.key].decisions);
      for (const name of removedSeedNames[def.key]) {
        const id = seedTagIds[def.key].get(name);
        if (id) removedExistingTagIds.push(id);
      }
    }
    onChange({ decisions, removedExistingTagIds });
  }, [sections, removedSeedNames, seedTagIds, onChange]);

  const scrapeSectionInner = async (def: SectionDef, urlOverride?: string) => {
    const effectiveUrl = (urlOverride ?? urlDraft).trim();
    if (!effectiveUrl) return;
    setSections((prev) => ({ ...prev, [def.key]: { ...prev[def.key], loading: true, error: null } }));
    try {
      const { data, error } = await supabase.functions.invoke("enrich-from-url", {
        body: {
          url: effectiveUrl,
          section_key: def.key,
          actor_context: { ...actorContext, actor_website: effectiveUrl },
          existing_items: sections[def.key].acceptedNames,
        },
      });
      if (error) throw new Error(error.message);
      const proposals = (data?.proposals ?? []) as EnrichedProposal[];
      setSections((prev) => ({
        ...prev,
        [def.key]: { ...prev[def.key], loading: false, proposals, scraped: true },
      }));
      if (proposals.length === 0) toast.info(`No new ${def.label.toLowerCase()} proposals.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scrape failed";
      setSections((prev) => ({ ...prev, [def.key]: { ...prev[def.key], loading: false, error: msg } }));
      toast.error(msg);
    }
  };

  const scrapeSection = async (def: SectionDef) => {
    const u = urlDraft.trim();
    if (!u) { toast.error("Enter a URL to scrape."); return; }
    commitEnrichmentUrl();
    await scrapeSectionInner(def, u);
  };

  const scrapeAll = async () => {
    const u = urlDraft.trim();
    if (!u) { toast.error("Enter a URL to scrape."); return; }
    commitEnrichmentUrl();
    for (const def of SECTIONS) {
      const sec = sections[def.key];
      // Skip sections currently loading
      if (sec.loading) continue;
      // Only scrape sections that are 'not_started' to respect prior reviews
      const total = sec.acceptedNames.length + sec.decisions.length + sec.proposals.length;
      if (total > 0 || sec.scraped) continue;
      await scrapeSectionInner(def, u);
    }
  };

  const removeAccepted = (key: SectionKey, name: string) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], acceptedNames: prev[key].acceptedNames.filter((n) => n !== name) },
    }));
    if (seedTagIds[key].has(name)) {
      setRemovedSeedNames((prev) => ({ ...prev, [key]: [...prev[key], name] }));
    }
  };

  const recordDecision = (
    key: SectionKey,
    proposal: EnrichedProposal,
    decision: CompletionDecision,
    addAcceptedName?: string,
  ) => {
    setSections((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        decisions: [...prev[key].decisions, decision],
        proposals: prev[key].proposals.filter((p) => p !== proposal),
        acceptedNames: addAcceptedName
          ? [...prev[key].acceptedNames, addAcceptedName]
          : prev[key].acceptedNames,
      },
    }));
  };

  const acceptAllMatched = (key: SectionKey) => {
    setSections((prev) => {
      const sec = prev[key];
      const matched = sec.proposals.filter((p) => !p.is_proposed_new);
      const remaining = sec.proposals.filter((p) => p.is_proposed_new);
      const newDecisions: CompletionDecision[] = matched
        .filter((p) => !!p.matched_entry_id)
        .map((p) => ({
          action: "map-to-existing",
          proposed_name: p.entry_name,
          proposed_category_id: p.proposed_category_id,
          mapped_to_entry_id: p.matched_entry_id,
          mapped_to_entry_name: p.entry_name,
        }));
      return {
        ...prev,
        [key]: {
          ...sec,
          proposals: remaining,
          decisions: [...sec.decisions, ...newDecisions],
          acceptedNames: [...sec.acceptedNames, ...matched.map((p) => p.entry_name)],
        },
      };
    });
  };

  const acceptOneMatched = (key: SectionKey, p: EnrichedProposal) => {
    if (!p.matched_entry_id) {
      toast.error("This proposal has no matched ontology entry.");
      return;
    }
    recordDecision(key, p, {
      action: "map-to-existing",
      proposed_name: p.entry_name,
      proposed_category_id: p.proposed_category_id,
      mapped_to_entry_id: p.matched_entry_id,
      mapped_to_entry_name: p.entry_name,
    }, p.entry_name);
  };

  const dismissProposal = (key: SectionKey, p: EnrichedProposal) =>
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], proposals: prev[key].proposals.filter((x) => x !== p) },
    }));

  const handleMapToExisting = (key: SectionKey, p: EnrichedProposal, pick: MapToExistingResult) =>
    recordDecision(key, p, {
      action: "map-to-existing",
      proposed_name: p.entry_name,
      proposed_category_id: p.proposed_category_id,
      mapped_to_entry_id: pick.entry_id,
      mapped_to_entry_name: pick.entry_name,
    }, pick.entry_name);

  const handleAcceptAsNew = (key: SectionKey, p: EnrichedProposal, desc: string | null) => {
    if (!p.proposed_category_id) {
      toast.error("No proposed category; cannot accept as new.");
      return;
    }
    recordDecision(key, p, {
      action: "accept-as-new",
      proposed_name: p.entry_name,
      proposed_category_id: p.proposed_category_id,
      mapped_to_entry_id: null,
      proposed_description: desc,
    }, `${p.entry_name} (proposed)`);
  };

  const handleMapAndPropose = (key: SectionKey, p: EnrichedProposal, pick: MapToExistingResult) =>
    recordDecision(key, p, {
      action: "map-and-propose",
      proposed_name: p.entry_name,
      proposed_category_id: p.proposed_category_id,
      mapped_to_entry_id: pick.entry_id,
      mapped_to_entry_name: pick.entry_name,
    }, pick.entry_name);

  const handleReject = (key: SectionKey, p: EnrichedProposal) =>
    recordDecision(key, p, {
      action: "reject",
      proposed_name: p.entry_name,
      proposed_category_id: p.proposed_category_id,
      mapped_to_entry_id: null,
    });

  const saveManual = (key: SectionKey) => {
    const name = (manualDrafts[key] ?? "").trim();
    if (!name) return;
    if (sections[key].acceptedNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      toast.info(`"${name}" is already in the list.`);
      setManualDrafts((p) => ({ ...p, [key]: null }));
      return;
    }
    const stub: EnrichedProposal = {
      entry_name: name,
      evidence: "Manually added by consultant",
      confidence: "medium",
      source_url: null,
      matched_entry_id: null,
      is_proposed_new: true,
      proposed_category_id: null,
      proposed_category_meta: null,
    };
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], proposals: [...prev[key].proposals, stub] },
    }));
    setManualDrafts((p) => ({ ...p, [key]: null }));
  };

  const sectionStatus = (sec: SectionState) => {
    if (sec.loading) return "loading" as const;
    const total = sec.acceptedNames.length + sec.decisions.length;
    const pending = sec.proposals.length;
    if (sec.scraped && pending === 0 && total > 0) return "completed" as const;
    if (total > 0 || pending > 0 || sec.scraped) return "in_progress" as const;
    return "not_started" as const;
  };

  const renderStatusPill = (sec: SectionState) => {
    const s = sectionStatus(sec);
    const totalDone = sec.acceptedNames.length + sec.decisions.length;
    const pending = sec.proposals.length;
    if (s === "loading") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border-accent/60 bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Scraping
        </span>
      );
    }
    if (s === "completed") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
          <Check className="w-2.5 h-2.5" /> All reviewed
        </span>
      );
    }
    if (s === "in_progress") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border-accent/60 bg-accent-teal/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
          {pending > 0 ? `${totalDone} reviewed · ${pending} to review` : `${totalDone} reviewed`}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-transparent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
        <CircleDashed className="w-2.5 h-2.5" /> Not started
      </span>
    );
  };

  // "Scrape all" visibility: at least one section is not_started.
  const anyNotStarted = SECTIONS.some((def) => sectionStatus(sections[def.key]) === "not_started");
  const anyLoading = SECTIONS.some((def) => sections[def.key].loading);

  return (
    <div className="space-y-4">
      <div className="text-xs text-foreground-muted">
        Review pre-seeded tags, scrape the actor's website for new proposals, or add tags manually.
        On submit, all decisions are recorded with the verification.
      </div>

      <div
        className={`rounded-md border p-3 space-y-1.5 transition-colors ${
          urlDraft.trim()
            ? "border-border-accent/60 bg-accent-teal/5"
            : "border-border bg-surface"
        }`}
      >
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-accent-teal" />
          Enrichment source URL
        </label>
        <Input
          type="url"
          value={urlDraft}
          onChange={(e) => {
            setUrlDraft(e.target.value);
            setUrlSource("typed");
          }}
          onBlur={commitEnrichmentUrl}
          placeholder="https://example.com"
          className="h-9 text-sm"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-foreground-muted">
            {urlDraft.trim() === ""
              ? "No website on file — paste a URL the AI should scrape for ontology proposals."
              : urlSource === "record"
                ? "Pre-filled from the actor record. Edit if you have a better source."
                : urlSource === "evidence"
                  ? "Pre-filled from the evidence source above. Edit if you have a better source."
                  : "Source for AI ontology proposals. Also mirrored into evidence."}
          </p>
          {anyNotStarted && (
            <Button
              size="sm"
              onClick={scrapeAll}
              disabled={anyLoading || !urlDraft.trim()}
              title={!urlDraft.trim() ? "Enter a URL above" : undefined}
            >
              {anyLoading
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scraping…</>
                : <><Sparkles className="w-3 h-3 mr-1" /> Scrape all sections</>}
            </Button>
          )}
        </div>
      </div>

      {SECTIONS.map((def) => {
        const sec = sections[def.key];
        const draftName = manualDrafts[def.key];
        const matchedProposals = sec.proposals.filter((p) => !p.is_proposed_new);
        const newProposals = sec.proposals.filter((p) => p.is_proposed_new);
        const status = sectionStatus(sec);
        return (
          <div key={def.key} className="bg-surface border border-border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  {def.label}
                </h4>
                {renderStatusPill(sec)}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm" variant="outline"
                  onClick={() => scrapeSection(def)}
                  disabled={sec.loading || !urlDraft.trim()}
                  title={!urlDraft.trim() ? "Enter a URL above" : undefined}
                >
                  {sec.loading
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scraping…</>
                    : <><Sparkles className="w-3 h-3 mr-1" /> {sec.scraped ? "Re-scrape" : "Enrich from URL"}</>}
                </Button>

                <Button
                  size="sm" variant="outline"
                  onClick={() => setManualDrafts((p) => ({ ...p, [def.key]: "" }))}
                  disabled={draftName !== null}
                >
                  <Plus className="w-3 h-3 mr-1" /> Manual
                </Button>
              </div>
            </div>

            {sec.error && <p className="text-xs text-destructive">{sec.error}</p>}

            {sec.acceptedNames.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {sec.acceptedNames.map((name) => {
                  const status = seedStatus[def.key].get(name);
                  const isProposed = status === "proposed";
                  return (
                    <li
                      key={name}
                      className={`inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${
                        isProposed
                          ? "bg-warning/10 border-warning/40 border-dashed"
                          : "bg-elevated/60 border-border"
                      }`}
                      title={isProposed ? "Proposed ontology entry (pending admin approval)" : undefined}
                    >
                      <Check className={`w-3 h-3 shrink-0 ${isProposed ? "text-warning" : "text-success"}`} />
                      <span className="font-mono">{name}</span>
                      {isProposed && (
                        <span className="text-[10px] uppercase tracking-wide text-warning">proposed</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAccepted(def.key, name)}
                        className="ml-0.5 text-foreground-muted hover:text-destructive"
                        aria-label={`Remove ${name}`}
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {draftName !== null && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setManualDrafts((p) => ({ ...p, [def.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveManual(def.key);
                    if (e.key === "Escape") setManualDrafts((p) => ({ ...p, [def.key]: null }));
                  }}
                  placeholder={`Add a ${def.label.toLowerCase().replace(/s$/, "")} by name`}
                  className="h-7 text-xs"
                />
                <Button size="sm" onClick={() => saveManual(def.key)} disabled={!draftName.trim()}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setManualDrafts((p) => ({ ...p, [def.key]: null }))}>
                  Cancel
                </Button>
              </div>
            )}

            {matchedProposals.length > 0 && (
              <ProposalReviewList
                proposals={matchedProposals}
                acceptingIdx={null}
                bulkAccepting={false}
                onAcceptOne={(p) => acceptOneMatched(def.key, p as EnrichedProposal)}
                onDismissOne={(idx) => {
                  const target = matchedProposals[idx];
                  if (target) dismissProposal(def.key, target);
                }}
                onAcceptAll={() => acceptAllMatched(def.key)}
                onDismissAll={() =>
                  setSections((prev) => ({
                    ...prev,
                    [def.key]: { ...prev[def.key], proposals: prev[def.key].proposals.filter((p) => p.is_proposed_new) },
                  }))
                }
                onClose={() =>
                  setSections((prev) => ({
                    ...prev,
                    [def.key]: { ...prev[def.key], proposals: prev[def.key].proposals.filter((p) => p.is_proposed_new) },
                  }))
                }
              />
            )}

            {newProposals.map((p, i) => (
              <ProposedNewCard
                key={`${p.entry_name}-${i}`}
                proposal={p}
                categoryType={def.ontoType}
                onMap={(pick) => handleMapToExisting(def.key, p, pick)}
                onAcceptNew={(desc) => handleAcceptAsNew(def.key, p, desc)}
                onMapAndPropose={(pick) => handleMapAndPropose(def.key, p, pick)}
                onReject={() => handleReject(def.key, p)}
              />
            ))}

            {status === "not_started" && draftName === null && (
              <p className="text-xs text-foreground-muted italic">
                {urlDraft.trim()
                  ? `No ${def.label.toLowerCase()} yet. Click Enrich from URL to fetch AI proposals, or add one manually.`
                  : `No ${def.label.toLowerCase()} yet. Paste a URL above to fetch AI proposals, or add one manually.`}
              </p>
            )}
            {status === "completed" && (
              <p className="text-[11px] text-foreground-muted">
                {sec.acceptedNames.length} accepted{sec.decisions.length > 0 ? ` · ${sec.decisions.length} decided` : ""}
              </p>
            )}
            {status === "in_progress" && !sec.loading && sec.proposals.length === 0 && sec.acceptedNames.length === 0 && sec.decisions.length === 0 && sec.scraped && (
              <p className="text-xs text-foreground-muted italic">No proposals returned. Try a different URL or add manually.</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
