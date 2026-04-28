import { useState, useMemo } from "react";
import { Loader2, Lock, Unlock, FlaskConical, Sparkles, CheckCircle2, Database, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import StepContainer from "./StepContainer";
import ReviewToggle from "./ReviewToggle";
import UnlockConfirmDialog from "./UnlockConfirmDialog";
import VerifiedStatusBadge from "./VerifiedStatusBadge";
import { buildCheckInputs, type useDatabaseCheck } from "@/hooks/useDatabaseCheck";
import type { useAnalysis } from "@/hooks/useAnalysis";
import type { useSearch, RoleSearchResult } from "@/hooks/useSearch";
import type { RoleAnalysisProgress } from "@/hooks/useAnalysis";

interface DatabaseCheckStepProps {
  hook: ReturnType<typeof useDatabaseCheck>;
  analysisHook: ReturnType<typeof useAnalysis>;
  searchHook: ReturnType<typeof useSearch>;
  step4Locked: boolean;
  onUnlock: () => void;
  downstreamStepNames: string[];
}

/** DEV fixture: a couple of analyzed actors so the check can run without Steps 1-4. */
const buildDevRoles = (): { analyzed: RoleAnalysisProgress[]; search: RoleSearchResult[] } => {
  const card1 = {
    id: "dev-actor-kongsberg",
    name: "Kongsberg Discovery AS",
    location: "Horten",
    country: "Norway",
    website: "https://www.kongsberg.com/discovery/",
    description: "Maritime sensing and surveillance systems.",
    match_strength: "strong" as const,
    actor_type: "commercial" as const,
    sources: [
      { url: "https://www.kongsberg.com/discovery/", title: "Kongsberg Discovery", type: "company_website" as const, credibility: "high" as const },
    ],
    evidence_snippets: ["Kongsberg Discovery delivers maritime sensors and surveillance solutions."],
    triage_decision: "included" as const,
    cross_role: false,
  };
  const card2 = {
    id: "dev-actor-norbit",
    name: "Norbit ASA",
    location: "Trondheim",
    country: "Norway",
    website: "https://norbit.com",
    description: "Multibeam sonar and surveillance technology.",
    match_strength: "moderate" as const,
    actor_type: "commercial" as const,
    sources: [
      { url: "https://norbit.com", title: "Norbit ASA", type: "company_website" as const, credibility: "high" as const },
    ],
    evidence_snippets: ["Norbit's wideband multibeam sonars are used for maritime surveillance."],
    triage_decision: "included" as const,
    cross_role: false,
  };

  const analyzed: RoleAnalysisProgress[] = [
    {
      role_id: "dev-role-radar",
      role_name: "Radar & Sensor Systems Provider",
      status: "complete",
      total_actors: 2,
      completed_actors: 2,
      actors: [
        { actor_id: card1.id, actor_name: card1.name, actor_type: "commercial", status: "complete", source_actor: card1 as any, result: null },
        { actor_id: card2.id, actor_name: card2.name, actor_type: "commercial", status: "complete", source_actor: card2 as any, result: null },
      ],
    },
  ];
  const search: RoleSearchResult[] = [
    {
      role_id: "dev-role-radar",
      role_name: "Radar & Sensor Systems Provider",
      status: "complete",
      queries_used: [],
      search_mode: "web",
      actors: [card1 as any, card2 as any],
    },
  ];
  return { analyzed, search };
};

const DatabaseCheckStep = ({
  hook,
  analysisHook,
  searchHook,
  step4Locked,
  onUnlock,
  downstreamStepNames,
}: DatabaseCheckStepProps) => {
  const { status, phase, result, savedCount, error, runCheck, saveToPersonalSpace, lock, totalMatches, totalSuggestions } = hook;

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const handleUnlockClick = () => {
    if (downstreamStepNames.length > 0) setUnlockDialogOpen(true);
    else onUnlock();
  };

  const totalAnalyzed = useMemo(() => {
    let n = 0;
    for (const r of analysisHook.orderedRoles || []) {
      for (const a of r.actors) if (a.status === "complete" || a.status === "skipped") n++;
    }
    return n;
  }, [analysisHook.orderedRoles]);

  const runFromState = () => {
    const { analyzed, saved } = buildCheckInputs(analysisHook.orderedRoles, searchHook.orderedRoles);
    runCheck(analyzed, saved);
  };

  const runDev = () => {
    const { analyzed, search } = buildDevRoles();
    const { analyzed: payload, saved } = buildCheckInputs(analyzed, search);
    runCheck(payload, saved);
  };

  const handleSave = () => {
    saveToPersonalSpace(analysisHook.orderedRoles, searchHook.orderedRoles);
  };

  const showDev =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dev") === "step5";

  // ── Locked view ─────────────────────────────────────────────────────
  if (status === "locked") {
    return (
      <StepContainer stepNumber={5} title="Database Check" status="locked">
        <div className="space-y-3">
          <p className="text-body-sm text-foreground-secondary">
            {totalMatches} verified · {totalSuggestions} similar in database
            {savedCount > 0 && ` · ${savedCount} saved to your collection`}
          </p>

          {reviewExpanded && result && (
            <div className="space-y-6 pt-2">
              {/* Phase 1 — exact matches (read-only) */}
              <section className="space-y-2">
                <span className="text-label uppercase tracking-wider text-foreground-muted">
                  Phase 1 · Exact match
                </span>
                {result.phase1_matches.length === 0 ? (
                  <p className="text-body-sm text-foreground-muted">No matches in database.</p>
                ) : (
                  <ul className="space-y-2">
                    {result.phase1_matches.map((m) => (
                      <li
                        key={m.session_actor_id}
                        className="flex items-start gap-3 rounded border border-border bg-elevated/40 px-3 py-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-body-sm font-medium text-foreground">{m.db_actor_name}</span>
                          <VerifiedStatusBadge
                            size="sm"
                            className="ml-2"
                            verifiedAt={m.verified_at}
                            decaysAt={m.decays_at}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {result.phase1_not_in_db.length > 0 && (
                  <p className="text-caption text-foreground-muted">
                    — {result.phase1_not_in_db.length} actor{result.phase1_not_in_db.length === 1 ? "" : "s"} not found in database —
                  </p>
                )}
              </section>

              {/* Phase 2 — similar suggestions (read-only) */}
              <section className="space-y-2">
                <span className="text-label uppercase tracking-wider text-foreground-muted">
                  Phase 2 · Similar actors in database
                </span>
                {result.phase2_suggestions.length === 0 ? (
                  <p className="text-body-sm text-foreground-muted">No additional actors found.</p>
                ) : (
                  <ul className="space-y-2">
                    {result.phase2_suggestions.map((s) => (
                      <li key={s.db_actor_id} className="rounded border border-border bg-elevated/40 px-3 py-2 space-y-1">
                        <div className="text-body-sm font-medium text-foreground">{s.actor_name}</div>
                        <div className="text-caption text-foreground-muted">{s.similarity_basis}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {savedCount > 0 && (
                <div className="rounded border border-accent-green/40 bg-accent-green/10 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent-green" />
                  <span className="text-body-sm text-foreground">
                    {savedCount} actor{savedCount === 1 ? "" : "s"} saved to your collection
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end items-center gap-1">
            {result && (
              <ReviewToggle expanded={reviewExpanded} onToggle={() => setReviewExpanded(!reviewExpanded)} />
            )}
            <Button
              variant="ghost"
              onClick={handleUnlockClick}
              className="gap-2 text-foreground-muted hover:text-foreground"
            >
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

  // ── Not started view ────────────────────────────────────────────────
  if (status === "not_started") {
    return (
      <StepContainer stepNumber={5} title="Database Check" status="not_started" isActive={step4Locked}>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive mb-2 max-w-md text-center">
              {error}
            </div>
          )}
          {step4Locked && (
            <Button onClick={runFromState} className="gap-2">
              <Database className="w-3.5 h-3.5" />
              Run database check
            </Button>
          )}
          {showDev && (
            <>
              <Button
                onClick={runDev}
                variant="outline"
                className="gap-2 text-foreground-muted border-border hover:text-foreground"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                DEV: Run test database check
              </Button>
              <p className="text-caption text-foreground-muted max-w-md text-center">
                DEV mode runs the check against the live actors table with two seed actors.
              </p>
            </>
          )}
        </div>
      </StepContainer>
    );
  }

  // ── Checking / Complete / Saving / Saved view ───────────────────────
  const isWorking = status === "checking" || status === "saving";
  const phaseLabel =
    phase === "phase1" ? "Phase 1: Exact matching…" :
    phase === "phase2" ? "Phase 2: Similarity search…" :
    null;

  return (
    <StepContainer stepNumber={5} title="Database Check" status="editing" isActive>
      <div className="flex flex-col" style={{ minHeight: "320px" }}>
        {/* SCROLLABLE results */}
        <div className="flex-1 min-h-0 space-y-6">
          {status === "checking" && (
            <div className="flex items-center gap-2 text-body-sm text-foreground-secondary py-4">
              <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
              {phaseLabel || "Checking database…"}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive">
              {error}
            </div>
          )}

          {result && (
            <>
              {/* Phase 1 — exact matches */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-label uppercase tracking-wider text-foreground-muted">
                    Phase 1 · Exact match
                  </span>
                </div>

                {result.phase1_matches.length === 0 && result.phase1_not_in_db.length === 0 ? (
                  <div className="rounded border border-border-subtle bg-elevated/30 p-4 text-body-sm text-foreground-muted">
                    No analyzed actors to check.
                  </div>
                ) : result.phase1_matches.length === 0 ? (
                  <div className="rounded border border-border-subtle bg-elevated/30 p-4 space-y-1.5">
                    <p className="text-body-sm text-foreground">
                      No actors found in the database yet.
                    </p>
                    <p className="text-caption text-foreground-muted">
                      This is normal for a new platform — the database grows as actors are
                      saved from pipeline runs.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {result.phase1_matches.map((m) => (
                      <li
                        key={m.session_actor_id}
                        className="flex items-start gap-3 rounded border border-border bg-elevated/40 px-3 py-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm font-medium text-foreground truncate">
                              {m.db_actor_name}
                            </span>
                            <VerifiedStatusBadge
                              size="sm"
                              verifiedAt={m.verified_at}
                              decaysAt={m.decays_at}
                            />
                          </div>
                          <p className="text-caption text-foreground-muted">
                            In database · Last updated{" "}
                            {new Date(m.last_updated).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                            })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {result.phase1_not_in_db.length > 0 && (
                  <p className="text-caption text-foreground-muted px-1">
                    — {result.phase1_not_in_db.length} actor
                    {result.phase1_not_in_db.length === 1 ? "" : "s"} not found in database —
                  </p>
                )}
              </section>

              {/* Phase 2 — similar suggestions */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-label uppercase tracking-wider text-foreground-muted">
                    Phase 2 · Similar actors in database
                  </span>
                </div>

                {result.phase2_suggestions.length === 0 ? (
                  <p className="text-body-sm text-foreground-muted px-1">
                    No additional actors found in database.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {result.phase2_suggestions.map((s) => (
                      <li
                        key={s.db_actor_id}
                        className="rounded border border-border bg-elevated/40 px-3 py-2 space-y-1"
                      >
                        <div className="text-body-sm font-medium text-foreground">{s.actor_name}</div>
                        <div className="text-caption text-foreground-muted">{s.similarity_basis}</div>
                        {(s.capacity_summary || s.classification_summary) && (
                          <div className="text-caption text-foreground-muted">
                            {[s.capacity_summary, s.classification_summary].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {status === "saved" && (
                <div className="rounded border border-accent-green/40 bg-accent-green/10 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-accent-green" />
                  <span className="text-body-sm text-foreground">
                    {savedCount} actor{savedCount === 1 ? "" : "s"} saved to your collection
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* PINNED FOOTER */}
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-border-subtle shrink-0 bg-surface gap-3">
          <div className="text-body-sm text-foreground-secondary space-x-4">
            <span className="font-mono text-mono-xs">{totalAnalyzed} analyzed</span>
            <span className="font-mono text-mono-xs text-accent-green">{totalMatches} verified</span>
            <span className="font-mono text-mono-xs text-foreground-muted">
              {totalSuggestions} similar
            </span>
            {savedCount > 0 && (
              <span className="font-mono text-mono-xs text-accent-teal">{savedCount} saved</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={isWorking || !result || status === "saved"}
              className="gap-2"
            >
              {status === "saving" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {status === "saved" ? "Saved" : "Save to my collection"}
            </Button>
            <Button onClick={lock} disabled={isWorking || !result} className="gap-2">
              <Lock className="w-3.5 h-3.5" />
              Lock step
            </Button>
          </div>
        </div>
      </div>
    </StepContainer>
  );
};

export default DatabaseCheckStep;
