import { useMemo, useState } from "react";
import { Loader2, Lock, Unlock, FlaskConical, Search, Bookmark, SlidersHorizontal, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import StepContainer from "./StepContainer";
import { SessionMapButton } from "./SessionMapButton";
import RoleProgressBox from "./RoleProgressBox";
import ActorCard from "./ActorCard";
import ReviewToggle from "./ReviewToggle";
import UnlockConfirmDialog from "./UnlockConfirmDialog";
import CoverageBanner from "./CoverageBanner";
import ConstraintPills from "./ConstraintPills";
import CompareModal from "./CompareModal";
import SaveSearchDialog from "./SaveSearchDialog";
import EditConstraintsSlideOver from "./EditConstraintsSlideOver";
import { useCompareSet } from "@/hooks/useCompareSet";
import type { useSearch, ActorCardData } from "@/hooks/useSearch";
import type { Interpretation } from "@/types/interpretation";

const MOCK_INTERPRETATION: Interpretation = {
  id: "mock-interp-001",
  summary: [
    { id: "s1", text: "Comprehensive surveillance in Narvik area", source: "axis", status: "accepted" },
  ],
  roles: [
    {
      id: "role-1",
      name: "Radar & Sensor Systems Provider",
      description: "Companies providing radar and sensor systems for land/sea/air surveillance",
      reasoning: "Core sensor capability needed for comprehensive surveillance",
      targets: {
        capabilities: [{ id: "c1", entryId: "mock-cap-1", rawName: "Radar Systems", categoryType: "capabilities", selected: true, source: "axis", status: "accepted" }],
        competences: [{ id: "c2", entryId: "mock-comp-1", rawName: "Systems Engineering", categoryType: "competences", selected: true, source: "axis", status: "accepted" }],
        domains: [{ id: "c3", entryId: "mock-dom-1", rawName: "Maritime", categoryType: "domains", selected: true, source: "axis", status: "accepted" }],
        productTypes: [{ id: "c4", entryId: "mock-pt-1", rawName: "Radar", categoryType: "productTypes", selected: true, source: "axis", status: "accepted" }],
        serviceTypes: [{ id: "c5", entryId: "mock-st-1", rawName: "Systems Integration", categoryType: "serviceTypes", selected: true, source: "axis", status: "accepted" }],
      },
      constraints: {},
      dependencies: [],
      priority: 1,
      source: "axis",
      status: "accepted",
    },
    {
      id: "role-2",
      name: "C2 & Communications Provider",
      description: "Command and control systems with integrated communications",
      reasoning: "Essential for coordinating multi-domain surveillance operations",
      targets: {
        capabilities: [{ id: "c6", entryId: "mock-cap-2", rawName: "Command & Control", categoryType: "capabilities", selected: true, source: "axis", status: "accepted" }],
        competences: [],
        domains: [],
        productTypes: [],
        serviceTypes: [],
      },
      constraints: {},
      dependencies: [],
      priority: 2,
      source: "axis",
      status: "accepted",
    },
    {
      id: "role-3",
      name: "EO/IR & Camera Systems Specialist",
      description: "Electro-optical and infrared camera systems for visual surveillance",
      reasoning: "Complements radar with visual identification capability",
      targets: {
        capabilities: [{ id: "c7", entryId: "mock-cap-3", rawName: "Electro-Optical Systems", categoryType: "capabilities", selected: true, source: "axis", status: "accepted" }],
        competences: [],
        domains: [],
        productTypes: [],
        serviceTypes: [],
      },
      constraints: {},
      dependencies: [],
      priority: 3,
      source: "axis",
      status: "accepted",
    },
    {
      id: "role-4",
      name: "UAV/Drone Operations Provider",
      description: "Unmanned aerial systems for persistent airborne surveillance",
      reasoning: "Airborne surveillance layer for the multi-domain solution",
      targets: {
        capabilities: [{ id: "c8", entryId: "mock-cap-4", rawName: "UAV Operations", categoryType: "capabilities", selected: true, source: "axis", status: "accepted" }],
        competences: [],
        domains: [],
        productTypes: [],
        serviceTypes: [],
      },
      constraints: {},
      dependencies: [],
      priority: 4,
      source: "axis",
      status: "accepted",
    },
    {
      id: "role-5",
      name: "Systems Integration & Managed Services",
      description: "Overall system integration and operational management",
      reasoning: "Needed to tie all surveillance components together and operate them",
      targets: {
        capabilities: [{ id: "c9", entryId: "mock-cap-5", rawName: "Systems Integration", categoryType: "capabilities", selected: true, source: "axis", status: "accepted" }],
        competences: [],
        domains: [],
        productTypes: [],
        serviceTypes: [],
      },
      constraints: {},
      dependencies: [],
      priority: 5,
      source: "axis",
      status: "accepted",
    },
  ],
  roles_count: 5,
  constraints: {
    geography: { countries: ["NO", "SE", "FI"], cities: ["Narvik"] },
    security_classification: { required_level: "CONFIDENTIAL" },
    readiness: { max_response_time: "12 months" },
    contract_duration: { duration: "3 years" },
  },
} as any;

interface SearchStepProps {
  hook: ReturnType<typeof useSearch>;
  interpretation: Interpretation | null;
  step2Locked: boolean;
  onUnlock: () => void;
  downstreamStepNames: string[];
  sessionId?: string | null;
  /** P13 — invoked when consultant accepts a coverage-driven role suggestion. */
  onAddRoleFromCoverage?: (name: string, summaryText: string) => Promise<void> | void;
}

const SearchStep = ({ hook, interpretation, step2Locked, onUnlock, downstreamStepNames, sessionId = null, onAddRoleFromCoverage }: SearchStepProps) => {
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editConstraintsOpen, setEditConstraintsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const compareSet = useCompareSet();
  // AX3b — local override so "Edit constraints" can re-run without mutating the locked Step 2 output.
  const [constraintsOverride, setConstraintsOverride] = useState<any | null>(null);

  const handleUnlockClick = () => {
    if (downstreamStepNames.length > 0) setUnlockDialogOpen(true);
    else onUnlock();
  };
  const {
    status,
    orderedRoles,
    expandedRoleId,
    error,
    totalFound,
    totalIncluded,
    totalSavedForLater,
    crossRoleCount,
    canLock,
    roleSearchModes,
    setRoleSearchMode,
    setExpandedRoleId,
    startSearch,
    includeActor,
    saveForLater,
    undoTriage,
    lock,
    unlock,
  } = hook;

  const expandedResult = orderedRoles.find(r => r.role_id === expandedRoleId);

  // AX3b — effective constraints used by header pills + Edit dialog.
  const effectiveConstraints = useMemo(
    () => constraintsOverride ?? interpretation?.constraints ?? {},
    [constraintsOverride, interpretation],
  );

  const rerunWith = (nextConstraints: any) => {
    if (!interpretation) return;
    const nextInterp: Interpretation = { ...interpretation, constraints: nextConstraints } as any;
    setConstraintsOverride(nextConstraints);
    startSearch(nextInterp);
    toast.success("Re-running with updated constraints");
  };

  const removePill = (key: string) => {
    const next = JSON.parse(JSON.stringify(effectiveConstraints ?? {}));
    if (key.startsWith("certifications.required:")) {
      const v = key.split(":")[1];
      next.certifications = next.certifications ?? {};
      next.certifications.required = (next.certifications.required ?? []).filter((c: string) => c !== v);
    } else if (key.startsWith("certifications.preferred:")) {
      const v = key.split(":")[1];
      next.certifications = next.certifications ?? {};
      next.certifications.preferred = (next.certifications.preferred ?? []).filter((c: string) => c !== v);
    } else {
      const [a, b] = key.split(".");
      if (a && b && next[a]) delete next[a][b];
    }
    rerunWith(next);
  };

  const compareInclude = (a: ActorCardData) => {
    // Find the role this actor belongs to so includeActor knows where to apply.
    for (const r of orderedRoles) {
      if (r.actors.some((x) => x.id === a.id)) {
        includeActor(r.role_id, a.id);
        toast.success(`Included ${a.name}`);
        return;
      }
    }
  };
  const compareSave = (a: ActorCardData) => {
    for (const r of orderedRoles) {
      if (r.actors.some((x) => x.id === a.id)) {
        saveForLater(r.role_id, a.id);
        toast.success(`Saved ${a.name}`);
        return;
      }
    }
  };

  const showDev =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("dev") === "step3";



  // Not started
  if (status === "not_started") {
    const acceptedRoles = interpretation?.roles?.filter((r: any) => r.status === "accepted") ?? [];
    const modes: Array<{ key: "web" | "db" | "both"; label: string }> = [
      { key: "web", label: "Search the web" },
      { key: "db", label: "Select from DB" },
      { key: "both", label: "Both" },
    ];
    return (
      <StepContainer stepNumber={3} title="Search" status="not_started" isActive={step2Locked}>
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive max-w-md text-center">
              {error}
            </div>
          )}

          {step2Locked && acceptedRoles.length > 0 && (
            <div className="w-full max-w-2xl space-y-2">
              <p className="text-caption text-foreground-muted uppercase tracking-wider">
                Source per role
              </p>
              <div className="space-y-1.5">
                {acceptedRoles.map((role: any) => {
                  const current = roleSearchModes.get(role.id) ?? "web";
                  return (
                    <div
                      key={role.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-border-subtle bg-surface"
                    >
                      <span className="text-body-sm text-foreground truncate">{role.name}</span>
                      <div className="flex rounded border border-border-subtle overflow-hidden shrink-0">
                        {modes.map(m => (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => setRoleSearchMode(role.id, m.key)}
                            className={
                              "px-2.5 py-1 text-caption transition-colors " +
                              (current === m.key
                                ? "bg-accent-teal/15 text-accent-teal"
                                : "text-foreground-muted hover:text-foreground hover:bg-elevated")
                            }
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step2Locked && interpretation && (
            <Button
              onClick={() => startSearch(interpretation)}
              className="gap-2"
            >
              <Search className="w-3.5 h-3.5" />
              Begin search
            </Button>
          )}
          {showDev && (
            <Button
              onClick={() => startSearch(MOCK_INTERPRETATION)}
              variant="outline"
              className="gap-2 text-foreground-muted border-border hover:text-foreground"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              DEV: Run test search
            </Button>
          )}
        </div>
      </StepContainer>
    );
  }

  // Locked
  if (status === "locked") {
    // Helpers — noop callbacks for read-only ActorCard rendering
    const noop = () => {};
    return (
      <StepContainer stepNumber={3} title="Search" status="locked">
        <div className="space-y-4">
          {/* Top stats line */}
          <p className="text-body-sm text-foreground-secondary">
            {totalIncluded} actors included · {totalSavedForLater} saved for later · {totalFound} total found
          </p>

          {/* Compact role-by-role breakdown — shown when not in Review mode */}
          {!reviewExpanded && orderedRoles.length > 0 && (
            <div className="space-y-3">
              {orderedRoles.map((role) => {
                const included = role.actors.filter((a) => a.triage_decision === "included");
                const shown = included.slice(0, 3);
                const more = included.length - shown.length;
                return (
                  <div key={role.role_id} className="space-y-0.5">
                    <p className="text-body-sm text-foreground">
                      {role.role_name}
                      <span className="text-foreground-muted"> — {included.length} included</span>
                    </p>
                    {included.length === 0 ? (
                      <p className="text-caption text-foreground-muted pl-3">— none included</p>
                    ) : (
                      <p className="text-caption text-foreground-muted pl-3">
                        {shown.map((a) => a.name).join(", ")}
                        {more > 0 && `, +${more} more`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Expanded review — full read-only actor cards per role */}
          {reviewExpanded && orderedRoles.length > 0 && (
            <div className="space-y-6 pt-2">
              {orderedRoles.map((role) => {
                const commercial = role.actors.filter((a) => a.actor_type === "commercial");
                const reference = role.actors.filter((a) => a.actor_type !== "commercial");
                return (
                  <section key={role.role_id} className="space-y-2">
                    <h3 className="text-body-sm font-medium text-foreground border-b border-border-subtle pb-1.5">
                      {role.role_name}
                      <span className="text-foreground-muted ml-2">
                        — {role.actors.length} actors found
                      </span>
                    </h3>
                    {role.actors.length === 0 ? (
                      <p className="text-caption text-foreground-muted pl-1 italic">No actors found.</p>
                    ) : (
                      <>
                        {commercial.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                              Commercial actors ({commercial.length})
                            </div>
                            {commercial.map((actor) => (
                              <ActorCard key={actor.id} actor={actor} roleId={role.role_id} onInclude={noop} onSaveForLater={noop} onUndo={noop} readOnly />
                            ))}
                          </div>
                        )}
                        {reference.length > 0 && (
                          <div className="space-y-2 mt-3">
                            <div className="text-[10px] uppercase tracking-wider text-info">
                              Reference actors ({reference.length})
                            </div>
                            {reference.map((actor) => (
                              <ActorCard key={actor.id} actor={actor} roleId={role.role_id} onInclude={noop} onSaveForLater={noop} onUndo={noop} readOnly />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          <div className="flex justify-end items-center gap-1">
            <SessionMapButton variant="search" />
            <ReviewToggle expanded={reviewExpanded} onToggle={() => setReviewExpanded(!reviewExpanded)} />
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

  // Searching or Reviewing — fixed frame: header (tabs + role title) / scrollable cards / pinned footer
  return (
    <StepContainer stepNumber={3} title="Search" status="editing" isActive>
      <div className="flex flex-col" style={{ height: "calc(100vh - 240px)" }}>
        {/* HEADER — always visible */}
        <div className="space-y-4 pb-4 shrink-0">
          {/* P13 — coverage-driven role suggestions (deterministic, post-search). */}
          {status === "reviewing" && interpretation && onAddRoleFromCoverage && (
            <CoverageBanner
              interpretation={interpretation}
              roleResults={orderedRoles}
              sessionId={sessionId}
              onAddRole={onAddRoleFromCoverage}
            />
          )}

          {/* AX3b — header toolbar: save / edit constraints / map */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <ConstraintPills constraints={effectiveConstraints} onRemove={removePill} />
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setEditConstraintsOpen(true)} className="gap-1.5 text-foreground-muted hover:text-foreground h-7">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Edit constraints
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)} className="gap-1.5 text-foreground-muted hover:text-foreground h-7" disabled={!interpretation}>
                <Bookmark className="w-3.5 h-3.5" />
                Save this search
              </Button>
              <SessionMapButton variant="search" />
            </div>
          </div>

          {/* Role progress boxes */}
          <div className="flex gap-2 pb-2 w-full">
            {orderedRoles.map(result => (
              <RoleProgressBox
                key={result.role_id}
                result={result}
                isActive={hook.activeRoleId === result.role_id}
                isExpanded={expandedRoleId === result.role_id}
                onClick={() => setExpandedRoleId(
                  expandedRoleId === result.role_id ? null : result.role_id
                )}
              />
            ))}
          </div>

          {/* Processing indicator */}
          {status === "searching" && (
            <div className="flex items-center gap-2 text-body-sm text-foreground-secondary">
              <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
              Searching roles sequentially...
            </div>
          )}

          {/* Expanded role header */}
          {expandedResult && expandedResult.actors.length > 0 && (
            <div className="flex items-center justify-between">
              <h3 className="text-body-sm font-medium text-foreground">
                {expandedResult.role_name}
                <span className="text-foreground-muted ml-2">
                  — {expandedResult.actors.length} actors found
                </span>
              </h3>
              {expandedResult.queries_used.length > 0 && (
                <span className="text-mono-xs font-mono text-foreground-muted">
                  {expandedResult.queries_used.length} queries · {expandedResult.processing_time_ms ? `${(expandedResult.processing_time_ms / 1000).toFixed(1)}s` : "—"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* SCROLLABLE actor cards area */}
        <div className="flex-1 min-h-0 relative">
          {expandedResult && expandedResult.actors.length > 0 && (
            <>
              <div className="h-full overflow-y-auto pr-2 space-y-2">
                {(() => {
                  const commercial = expandedResult.actors.filter(a => a.actor_type === "commercial");
                  const reference = expandedResult.actors.filter(a => a.actor_type !== "commercial");
                  return (
                    <>
                      {commercial.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-foreground-muted px-1 pt-1">
                            Commercial actors ({commercial.length})
                          </div>
                          {commercial.map(actor => (
                            <ActorCard key={actor.id} actor={actor} roleId={expandedResult.role_id} onInclude={includeActor} onSaveForLater={saveForLater} onUndo={undoTriage} isCompareSelected={compareSet.has(actor.id)} onToggleCompare={compareSet.toggle} />
                          ))}
                        </>
                      )}
                      {reference.length > 0 && (
                        <>
                          <div className="text-[10px] uppercase tracking-wider text-info px-1 pt-3">
                            Reference actors ({reference.length})
                          </div>
                          {reference.map(actor => (
                            <ActorCard key={actor.id} actor={actor} roleId={expandedResult.role_id} onInclude={includeActor} onSaveForLater={saveForLater} onUndo={undoTriage} isCompareSelected={compareSet.has(actor.id)} onToggleCompare={compareSet.toggle} />
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
              {/* Bottom fade indicator */}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
            </>
          )}

          {expandedResult?.error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive">
              {expandedResult.error}
            </div>
          )}
        </div>

        {/* PINNED FOOTER — always visible: stats + lock (visible during search, enabled when ≥1 included) */}
        {(status === "searching" || status === "reviewing") && (
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-border-subtle shrink-0 bg-surface">
            <div className="text-body-sm text-foreground-secondary space-x-4">
              <span className="font-mono text-mono-xs">{totalFound} found</span>
              <span className="font-mono text-mono-xs text-accent-teal">{totalIncluded} included</span>
              <span className="font-mono text-mono-xs">{totalSavedForLater} saved</span>
              {crossRoleCount > 0 && (
                <span className="font-mono text-mono-xs text-accent-blue">{crossRoleCount} cross-role</span>
              )}
            </div>
            <Button
              onClick={lock}
              disabled={totalIncluded < 1}
              className="gap-2"
              title={totalIncluded < 1 ? "Include at least one actor before locking" : undefined}
            >
              <Lock className="w-3.5 h-3.5" />
              Lock selection and proceed to Step 4 →
            </Button>
          </div>
        )}
      </div>
    </StepContainer>
  );
};

export default SearchStep;

