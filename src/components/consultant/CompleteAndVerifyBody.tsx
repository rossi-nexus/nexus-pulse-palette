// B4: Completion body shared by VerificationReviewDialog's "Complete & verify"
// (approve path) and "Complete & re-verify" (re-verify path).
//
// Pre-seeds each of the five ontology sections from either:
//   - approve path: user_personal_actors.analysis_data JSONB (raw pipeline shape)
//   - re-verify path: existing actor_ontology_tags joined with ontology_entries
//
// Wraps the four-action enrichment UX (ProposedNewCard + MapToExistingPanel)
// reused verbatim from B1-fix3, and a manual-add input.
//
// On every change, calls onChange with the current { decisions, removedSeedNames }
// so the parent dialog can pass them to the verification RPC on submit.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProposedNewCard } from "@/components/ontology/ProposedNewCard";
import { ProposalReviewList, type ReviewProposal } from "@/components/nexus/ProposalReviewList";
import type { MapToExistingResult } from "@/components/ontology/MapToExistingPanel";

export type CompletionAction = "map-to-existing" | "accept-as-new" | "map-and-propose" | "reject";

export interface CompletionDecision {
  action: CompletionAction;
  proposed_name: string;
  proposed_category_id: string | null;
  mapped_to_entry_id: string | null;
  mapped_to_entry_name?: string | null;
  proposed_description?: string | null;
}

type SectionKey = "capabilities" | "competences" | "domains" | "products" | "services";

interface SectionDef {
  key: SectionKey;
  label: string;
  ontoType: "capability" | "competence" | "domain" | "product_type" | "service_type";
}

const SECTIONS: SectionDef[] = [
  { key: "capabilities", label: "Capabilities", ontoType: "capability" },
  { key: "competences", label: "Competences", ontoType: "competence" },
  { key: "domains", label: "Domains", ontoType: "domain" },
  { key: "products", label: "Product types", ontoType: "product_type" },
  { key: "services", label: "Service types", ontoType: "service_type" },
];

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

/** Pre-seeded pill: name plus an optional ontology entry id (for existing tags). */
export interface SeedPill {
  entry_name: string;
  /** present for re-verify path (existing tag); null for approve-path JSONB seeds. */
  ontology_entry_id?: string | null;
  /** Ontology entry status (re-verify path only): 'active' or 'proposed'. */
  status?: "active" | "proposed" | string | null;
}

export type CompletionSeed = Record<SectionKey, SeedPill[]>;

type SectionState = {
  loading: boolean;
  error: string | null;
  proposals: EnrichedProposal[];
  /** Accepted = original seed pills kept + bulk-accepted proposals. Display only. */
  acceptedNames: string[];
  /** Decisions for proposed-new items. Submitted to RPC. */
  decisions: CompletionDecision[];
  scraped: boolean;
};

const emptySection = (): SectionState => ({
  loading: false, error: null, proposals: [], acceptedNames: [], decisions: [], scraped: false,
});

interface Props {
  /** Website to scrape ontology proposals from (actor_website or first websites entry). */
  websiteUrl: string | null;
  /** Actor display context passed to enrich-from-url. */
  actorContext: { actor_name: string; country: string | null };
  /** Initial pre-seeded items per section. */
  seed: CompletionSeed;
  /** Fires whenever decisions or seed-removal change. */
  onChange: (payload: {
    decisions: CompletionDecision[];
    /** Re-verify path: existing tag ids the consultant removed (not yet wired to RPC). */
    removedExistingTagIds: string[];
  }) => void;
}

/** Flatten pipeline analysis_data section into plain entry-name pills. */
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

/** Build a CompletionSeed from a personal actor's analysis_data JSONB. */
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

export const emptyCompletionSeed = (): CompletionSeed => ({
  capabilities: [], competences: [], domains: [], products: [], services: [],
});

export const CompleteAndVerifyBody = ({ websiteUrl, actorContext, seed, onChange }: Props) => {
  const [urlDraft, setUrlDraft] = useState<string>(websiteUrl ?? "");
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>(() => {
    const s = {} as Record<SectionKey, SectionState>;
    for (const def of SECTIONS) {
      s[def.key] = { ...emptySection(), acceptedNames: seed[def.key].map((p) => p.entry_name) };
    }
    return s;
  });
  const [removedSeedNames, setRemovedSeedNames] = useState<Record<SectionKey, string[]>>({
    capabilities: [], competences: [], domains: [], products: [], services: [],
  });
  const [manualDrafts, setManualDrafts] = useState<Record<SectionKey, string | null>>({
    capabilities: null, competences: null, domains: null, products: null, services: null,
  });

  // Build seed lookup: section -> name -> ontology_entry_id (or undefined)
  const seedTagIds = useMemo(() => {
    const map: Record<SectionKey, Map<string, string | null>> = {
      capabilities: new Map(), competences: new Map(), domains: new Map(), products: new Map(), services: new Map(),
    };
    for (const def of SECTIONS) {
      for (const p of seed[def.key]) {
        map[def.key].set(p.entry_name, p.ontology_entry_id ?? null);
      }
    }
    return map;
  }, [seed]);

  // Build seed status lookup: section -> name -> status (for visual differentiation)
  const seedStatus = useMemo(() => {
    const map: Record<SectionKey, Map<string, string | null>> = {
      capabilities: new Map(), competences: new Map(), domains: new Map(), products: new Map(), services: new Map(),
    };
    for (const def of SECTIONS) {
      for (const p of seed[def.key]) {
        if (p.status) map[def.key].set(p.entry_name, p.status);
      }
    }
    return map;
  }, [seed]);

  // Bubble decisions + removed tag ids to parent
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

  const scrapeSection = async (def: SectionDef) => {
    if (!websiteUrl) {
      toast.error("This actor has no website to scrape.");
      return;
    }
    setSections((prev) => ({ ...prev, [def.key]: { ...prev[def.key], loading: true, error: null } }));
    try {
      const { data, error } = await supabase.functions.invoke("enrich-from-url", {
        body: {
          url: websiteUrl,
          section_key: def.key,
          actor_context: { ...actorContext, actor_website: websiteUrl },
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

  const removeAccepted = (key: SectionKey, name: string) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], acceptedNames: prev[key].acceptedNames.filter((n) => n !== name) },
    }));
    // Track seed removals separately so parent can wire to RPC later
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
      // Bulk accept of AI-matched proposals: record as map-to-existing decisions
      // so they actually create tags via the RPC.
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
    recordDecision(
      key, p,
      {
        action: "map-to-existing",
        proposed_name: p.entry_name,
        proposed_category_id: p.proposed_category_id,
        mapped_to_entry_id: p.matched_entry_id,
        mapped_to_entry_name: p.entry_name,
      },
      p.entry_name,
    );
  };

  const dismissProposal = (key: SectionKey, p: EnrichedProposal) =>
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], proposals: prev[key].proposals.filter((x) => x !== p) },
    }));

  const handleMapToExisting = (key: SectionKey, p: EnrichedProposal, pick: MapToExistingResult) =>
    recordDecision(
      key, p,
      {
        action: "map-to-existing",
        proposed_name: p.entry_name,
        proposed_category_id: p.proposed_category_id,
        mapped_to_entry_id: pick.entry_id,
        mapped_to_entry_name: pick.entry_name,
      },
      pick.entry_name,
    );

  const handleAcceptAsNew = (key: SectionKey, p: EnrichedProposal, desc: string | null) => {
    if (!p.proposed_category_id) {
      toast.error("No proposed category; cannot accept as new.");
      return;
    }
    recordDecision(
      key, p,
      {
        action: "accept-as-new",
        proposed_name: p.entry_name,
        proposed_category_id: p.proposed_category_id,
        mapped_to_entry_id: null,
        proposed_description: desc,
      },
      `${p.entry_name} (proposed)`,
    );
  };

  const handleMapAndPropose = (key: SectionKey, p: EnrichedProposal, pick: MapToExistingResult) =>
    recordDecision(
      key, p,
      {
        action: "map-and-propose",
        proposed_name: p.entry_name,
        proposed_category_id: p.proposed_category_id,
        mapped_to_entry_id: pick.entry_id,
        mapped_to_entry_name: pick.entry_name,
      },
      pick.entry_name,
    );

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
    // Try to match against existing accepted (avoid duplicates)
    if (sections[key].acceptedNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      toast.info(`"${name}" is already in the list.`);
      setManualDrafts((p) => ({ ...p, [key]: null }));
      return;
    }
    // Manual entry → synthesize a proposed-new style decision that the consultant
    // can refine via the four-action UX. For simplicity here, create a stub
    // proposal card by pushing into proposals (without a proposed_category_id,
    // so only "Map to existing" + "Reject" are available — same constraint as wizard).
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

  return (
    <div className="space-y-4">
      <div className="text-xs text-foreground-muted">
        Review pre-seeded tags, scrape the actor's website for new proposals, or add tags manually.
        On submit, all decisions are recorded with the verification.
      </div>

      {SECTIONS.map((def) => {
        const sec = sections[def.key];
        const draftName = manualDrafts[def.key];
        const matchedProposals = sec.proposals.filter((p) => !p.is_proposed_new);
        const newProposals = sec.proposals.filter((p) => p.is_proposed_new);
        return (
          <div key={def.key} className="bg-surface border border-border rounded-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {def.label}
                {sec.acceptedNames.length > 0 && (
                  <span className="ml-2 text-foreground-muted normal-case font-normal">
                    {sec.acceptedNames.length} accepted
                  </span>
                )}
                {sec.decisions.length > 0 && (
                  <span className="ml-2 text-foreground-muted normal-case font-normal">
                    · {sec.decisions.length} decided
                  </span>
                )}
              </h4>
              <div className="flex gap-1">
                <Button
                  size="sm" variant="ghost"
                  onClick={() => scrapeSection(def)}
                  disabled={sec.loading || !websiteUrl}
                  title={!websiteUrl ? "No website set" : undefined}
                >
                  {sec.loading
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scraping…</>
                    : sec.scraped ? "Re-scrape" : "Enrich from URL"}
                </Button>
                <Button
                  size="sm" variant="ghost"
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

            {!sec.loading && sec.scraped && sec.proposals.length === 0 && sec.acceptedNames.length === 0 && (
              <p className="text-xs text-foreground-muted italic">No proposals.</p>
            )}
          </div>
        );
      })}
    </div>
  );
};
