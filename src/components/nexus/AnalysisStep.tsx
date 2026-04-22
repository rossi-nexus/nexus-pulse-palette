import { useState, useMemo } from "react";
import { Loader2, Lock, Unlock, FlaskConical, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import StepContainer from "./StepContainer";
import AnalysisRoleProgressBox from "./AnalysisRoleProgressBox";
import AnalyzedActorCard from "./AnalyzedActorCard";
import ReferenceActorInfoBox from "./ReferenceActorInfoBox";
import ReviewToggle from "./ReviewToggle";
import UnlockConfirmDialog from "./UnlockConfirmDialog";
import type { useAnalysis, AnalysisInput, ActorAnalysisStatus } from "@/hooks/useAnalysis";
import type { Interpretation } from "@/types/interpretation";
import type { useSearch } from "@/hooks/useSearch";
import type { ActorAnalysis, MatchedCategory } from "@/types/analyzed-actors";

/** Sum of all matched ontology entries across every category. */
const matchCount = (analysis: ActorAnalysis | null | undefined): number => {
  if (!analysis) return 0;
  const cat = (cats: MatchedCategory[]) =>
    (cats || []).reduce((s, c) => s + (c.entries?.length || 0), 0);
  return (
    cat(analysis.capabilities) +
    cat(analysis.competences) +
    (analysis.domains?.length || 0) +
    (analysis.products?.length || 0) +
    (analysis.services?.length || 0)
  );
};

interface AnalysisStepProps {
  hook: ReturnType<typeof useAnalysis>;
  interpretation: Interpretation | null;
  searchHook: ReturnType<typeof useSearch>;
  step3Locked: boolean;
  onUnlock: () => void;
  downstreamStepNames: string[];
}

/**
 * DEV fixture: Narvik-area Norwegian defence companies.
 * Uses real actor data so the test exercises the same pipeline as a live run.
 */
const buildDevInput = (): AnalysisInput => {
  const role1Id = "dev-role-radar";
  const role2Id = "dev-role-c2";

  const targetsRadar = {
    capabilities: [
      { id: "t1", entryId: "dev-cap-radar", rawName: "Radar systems", categoryType: "capabilities", selected: true, source: "axis" as const, status: "accepted" as const },
      { id: "t2", entryId: "dev-cap-sensorfusion", rawName: "Sensor fusion", categoryType: "capabilities", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    competences: [
      { id: "t3", entryId: "dev-comp-syseng", rawName: "Systems engineering", categoryType: "competences", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    domains: [
      { id: "t4", entryId: "dev-dom-maritime", rawName: "Maritime security", categoryType: "domains", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    productTypes: [
      { id: "t5", entryId: "dev-pt-radar", rawName: "Radar (ground-based)", categoryType: "productTypes", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    serviceTypes: [
      { id: "t6", entryId: "dev-st-integration", rawName: "Systems integration", categoryType: "serviceTypes", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
  };

  const targetsC2 = {
    capabilities: [
      { id: "t7", entryId: "dev-cap-c2", rawName: "Command & control", categoryType: "capabilities", selected: true, source: "axis" as const, status: "accepted" as const },
      { id: "t8", entryId: "dev-cap-isr", rawName: "ISR", categoryType: "capabilities", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    competences: [
      { id: "t9", entryId: "dev-comp-software", rawName: "Software engineering", categoryType: "competences", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    domains: [
      { id: "t10", entryId: "dev-dom-defence", rawName: "Defence & military", categoryType: "domains", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    productTypes: [
      { id: "t11", entryId: "dev-pt-c2", rawName: "C2 software platform", categoryType: "productTypes", selected: true, source: "axis" as const, status: "accepted" as const },
    ],
    serviceTypes: [],
  };

  const roles: any[] = [
    {
      id: role1Id,
      name: "Radar & Sensor Systems Provider",
      description: "Companies providing radar and sensor systems for surveillance",
      reasoning: "",
      targets: targetsRadar,
      constraints: {},
      dependencies: [],
      priority: 1,
      source: "axis",
      status: "accepted",
    },
    {
      id: role2Id,
      name: "C2 & Systems Integration",
      description: "Command & control and integration providers",
      reasoning: "",
      targets: targetsC2,
      constraints: {},
      dependencies: [],
      priority: 2,
      source: "axis",
      status: "accepted",
    },
  ];

  const roleResults = [
    {
      role_id: role1Id,
      role_name: "Radar & Sensor Systems Provider",
      status: "complete" as const,
      queries_used: [],
      search_mode: "web" as const,
      actors: [
        {
          id: "dev-actor-kongsberg-discovery",
          name: "Kongsberg Discovery",
          location: "Horten",
          country: "Norway",
          website: "https://www.kongsbergdiscovery.com",
          description: "Kongsberg Discovery is a global provider of underwater sensor and acoustics technology with strong presence in maritime surveillance.",
          match_strength: "strong" as const,
          sources: [
            { url: "https://www.kongsbergdiscovery.com", title: "Kongsberg Discovery — Home", type: "company_website" as const, credibility: "high" as const },
          ],
          evidence_snippets: [
            "Kongsberg Discovery delivers sonar, acoustic and integrated maritime surveillance systems to defence and civil customers.",
          ],
          triage_decision: "included" as const,
          cross_role: false,
          actor_type: "commercial",
        } as any,
        {
          id: "dev-actor-norbit",
          name: "Norbit",
          location: "Trondheim",
          country: "Norway",
          website: "https://www.norbit.com",
          description: "Norwegian technology group designing and manufacturing tailored sensor and connectivity solutions for maritime and defence markets.",
          match_strength: "moderate" as const,
          sources: [
            { url: "https://www.norbit.com", title: "Norbit Group", type: "company_website" as const, credibility: "high" as const },
          ],
          evidence_snippets: [
            "Norbit's wideband multibeam sonars are used for maritime surveillance and seabed mapping.",
          ],
          triage_decision: "included" as const,
          cross_role: false,
          actor_type: "commercial",
        } as any,
      ],
    },
    {
      role_id: role2Id,
      role_name: "C2 & Systems Integration",
      status: "complete" as const,
      queries_used: [],
      search_mode: "web" as const,
      actors: [
        {
          id: "dev-actor-andoya",
          name: "Andøya Space",
          location: "Andøya",
          country: "Norway",
          website: "https://andoyaspace.no",
          description: "Norwegian state-owned space and rocket-range operator providing launch, test, and surveillance support services.",
          match_strength: "moderate" as const,
          sources: [
            { url: "https://andoyaspace.no", title: "Andøya Space", type: "company_website" as const, credibility: "high" as const },
          ],
          evidence_snippets: [
            "Andøya Space operates rocket ranges and surveillance infrastructure in Northern Norway.",
          ],
          triage_decision: "included" as const,
          cross_role: false,
          actor_type: "commercial",
        } as any,
      ],
    },
  ];

  const constraints = {
    geography: { countries: ["NO"], cities: ["Narvik"] },
    security_classification: { required_level: "CONFIDENTIAL" },
  };

  return { roles, roleResults, constraints };
};

const AnalysisStep = ({ hook, interpretation, searchHook, step3Locked, onUnlock, downstreamStepNames }: AnalysisStepProps) => {
  const {
    status,
    orderedRoles,
    activeRoleId,
    expandedRoleId,
    error,
    totals,
    setExpandedRoleId,
    startAnalysis,
    lock,
  } = hook;

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const handleUnlockClick = () => {
    if (downstreamStepNames.length > 0) setUnlockDialogOpen(true);
    else onUnlock();
  };

  // Local exclude state — UI-only, doesn't touch the hook
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const toggleExclude = (actorId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(actorId)) next.delete(actorId);
      else next.add(actorId);
      return next;
    });
  };

  // Effective included count = analyzed actors that are NOT user-excluded
  const includedCount = useMemo(() => {
    let n = 0;
    for (const r of orderedRoles) {
      for (const a of r.actors) {
        if (a.status === "complete" && !excludedIds.has(a.actor_id)) n++;
      }
    }
    return n;
  }, [orderedRoles, excludedIds]);
  const excludedCount = excludedIds.size;

  const expanded = orderedRoles.find((r) => r.role_id === expandedRoleId);

  const runFromState = () => {
    if (!interpretation) return;
    const acceptedRoles = interpretation.roles.filter((r) => r.status !== "rejected");
    startAnalysis({
      roles: acceptedRoles,
      roleResults: searchHook.orderedRoles,
      constraints: interpretation.constraints,
    });
  };

  const showDev =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("dev") === "step4";

  // Not started
  if (status === "not_started") {
    return (
      <StepContainer stepNumber={4} title="Deep Analysis" status="not_started" isActive={step3Locked}>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive mb-2 max-w-md text-center">
              {error}
            </div>
          )}
          {step3Locked && interpretation && (
            <Button onClick={runFromState} className="gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Begin analysis
            </Button>
          )}
          {showDev && (
            <>
              <Button
                onClick={() => startAnalysis(buildDevInput())}
                variant="outline"
                className="gap-2 text-foreground-muted border-border hover:text-foreground"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                DEV: Run test analysis
              </Button>
              <p className="text-caption text-foreground-muted max-w-md text-center">
                DEV mode runs real Serper + AI analysis on 3 Norwegian defence actors. This will consume API credits.
              </p>
            </>
          )}
        </div>
      </StepContainer>
    );
  }

  // Locked
  if (status === "locked") {
    return (
      <StepContainer stepNumber={4} title="Deep Analysis" status="locked">
        <div className="space-y-4">
          {/* Top stats line */}
          <p className="text-body-sm text-foreground-secondary">
            {totals.analyzed} actors analyzed · {totals.reference} reference actors
            {totals.errors > 0 && ` · ${totals.errors} errors`}
          </p>

          {/* Role-by-role breakdown */}
          {orderedRoles.length > 0 && (
            <div className="space-y-3">
              {orderedRoles.map((role) => {
                const analyzed = role.actors.filter((a) => a.status === "complete");
                const reference = role.actors.filter((a) => a.status === "skipped");
                const shownAnalyzed = analyzed.slice(0, 3);
                const moreAnalyzed = analyzed.length - shownAnalyzed.length;
                return (
                  <div key={role.role_id} className="space-y-0.5">
                    <p className="text-body-sm text-foreground">
                      {role.role_name}
                      <span className="text-foreground-muted">
                        {" — "}
                        {analyzed.length} analyzed
                        {reference.length > 0 && `, ${reference.length} reference`}
                      </span>
                    </p>
                    {analyzed.length === 0 && reference.length === 0 ? (
                      <p className="text-caption text-foreground-muted pl-3">— none</p>
                    ) : (
                      <>
                        {shownAnalyzed.map((a) => (
                          <p key={a.actor_id} className="text-caption text-foreground-muted pl-3">
                            <span className="text-foreground-secondary">{a.actor_name}</span>
                            {" — "}
                            {matchCount(a.result)} matches
                          </p>
                        ))}
                        {moreAnalyzed > 0 && (
                          <p className="text-caption text-foreground-muted pl-3">+{moreAnalyzed} more</p>
                        )}
                        {reference.length > 0 && (
                          <p className="text-caption text-foreground-muted/80 pl-3 italic">
                            {reference.map((a) => a.actor_name).join(", ")} — reference (not analyzed)
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleUnlockClick} className="gap-2 text-foreground-muted hover:text-foreground">
              <Unlock className="w-3.5 h-3.5" />
              Unlock
            </Button>
          </div>
        </div>
        <UnlockConfirmDialog
          open={unlockDialogOpen}
          onOpenChange={setUnlockDialogOpen}
          downstreamStepNames={downstreamStepNames}
          onConfirm={onUnlock}
        />
      </StepContainer>
    );
  }

  // Analyzing or Complete — fixed frame: header (tabs + role title) / scrollable cards / pinned footer
  return (
    <StepContainer stepNumber={4} title="Deep Analysis" status="editing" isActive>
      <div className="flex flex-col" style={{ height: "calc(100vh - 240px)" }}>
        {/* HEADER — always visible */}
        <div className="space-y-4 pb-4 shrink-0">
          {/* Role progress boxes — fit all 5 in a single row, no horizontal scroll */}
          <div className="flex gap-2 w-full">
            {orderedRoles.map((r) => (
              <AnalysisRoleProgressBox
                key={r.role_id}
                progress={r}
                isActive={activeRoleId === r.role_id}
                isExpanded={expandedRoleId === r.role_id}
                onClick={() => setExpandedRoleId(expandedRoleId === r.role_id ? null : r.role_id)}
              />
            ))}
          </div>

          {/* Live processing indicator */}
          {status === "analyzing" && (
            <div className="flex items-center gap-2 text-body-sm text-foreground-secondary">
              <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
              Analyzing actors sequentially…
            </div>
          )}

          {/* Expanded role header */}
          {expanded && expanded.actors.length > 0 && (
            <div className="flex items-center justify-between">
              <h3 className="text-body-sm font-medium text-foreground">
                {expanded.role_name}
                <span className="text-foreground-muted ml-2">
                  — {expanded.completed_actors}/{expanded.total_actors} processed
                </span>
              </h3>
            </div>
          )}
        </div>

        {/* SCROLLABLE actor cards area */}
        <div className="flex-1 min-h-0 relative">
          {expanded && expanded.actors.length > 0 && (
            <>
              <div className="h-full overflow-y-auto pr-2 space-y-2">
                {/* Reference-actor explainer — once per role, only when present */}
                {expanded.actors.some((a) => a.status === "skipped") && (
                  <ReferenceActorInfoBox />
                )}
                {expanded.actors.map((actorState) => (
                  <AnalyzedActorCard
                    key={actorState.actor_id}
                    state={actorState}
                    excluded={excludedIds.has(actorState.actor_id)}
                    onToggleExclude={toggleExclude}
                  />
                ))}
              </div>
              {/* Bottom fade indicator */}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
            </>
          )}
        </div>

        {/* PINNED FOOTER — visible during analysis and after */}
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-border-subtle shrink-0 bg-surface">
          <div className="text-body-sm text-foreground-secondary space-x-4">
            <span className="font-mono text-mono-xs text-accent-teal">{includedCount} included</span>
            {excludedCount > 0 && (
              <span className="font-mono text-mono-xs text-destructive">{excludedCount} excluded</span>
            )}
            <span className="font-mono text-mono-xs">{totals.analyzed} analyzed</span>
            {totals.reference > 0 && (
              <span className="font-mono text-mono-xs text-foreground-muted">{totals.reference} reference</span>
            )}
            {totals.errors > 0 && (
              <span className="font-mono text-mono-xs text-destructive">{totals.errors} errors</span>
            )}
          </div>
          <Button
            onClick={lock}
            disabled={status === "analyzing" || includedCount < 1}
            className="gap-2"
            title={
              status === "analyzing"
                ? "Analysis in progress…"
                : includedCount < 1
                  ? "At least one actor must remain included"
                  : undefined
            }
          >
            <Lock className="w-3.5 h-3.5" />
            Lock analysis and run database check →
          </Button>
        </div>
      </div>
    </StepContainer>
  );
};

export default AnalysisStep;

