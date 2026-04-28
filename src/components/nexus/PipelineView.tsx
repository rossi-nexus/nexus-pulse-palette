import StepContainer from "./StepContainer";
import AxisSidebar from "./AxisSidebar";
import StatusBar from "./StatusBar";
import NeedInput from "./NeedInput";
import ExampleSearchCard from "./ExampleSearchCard";
import CompactStepIndicator from "./CompactStepIndicator";
import InterpretationStep from "./InterpretationStep";
import SearchStep from "./SearchStep";
import AnalysisStep from "./AnalysisStep";
import DatabaseCheckStep from "./DatabaseCheckStep";
import ProgrammeContextBanner from "./ProgrammeContextBanner";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useSessionContext } from "@/contexts/SessionContext";
import { useStepA1 } from "@/hooks/useStepA1";
import { useInterpretation } from "@/hooks/useInterpretation";
import { useSearch } from "@/hooks/useSearch";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useDatabaseCheck } from "@/hooks/useDatabaseCheck";
import { EXAMPLE_SEARCHES } from "@/constants/exampleSearches";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Interpretation, ClarificationPoint } from "@/types/interpretation";
import type { LockedA3Output, LockedA4Output } from "@/types/pipeline";
import type { RoleSearchResult } from "@/hooks/useSearch";
import type { RoleAnalysisProgress } from "@/hooks/useAnalysis";

const STEP_NAMES: Record<number, string> = {
  1: "Define Your Need",
  2: "Interpretation & Targets",
  3: "Search",
  4: "Deep Analysis",
  5: "Database Check",
};

const PipelineView = () => {
  const { sessionId, sessions, refreshSessions } = useSessionContext();
  const programmeId = sessions.find((s) => s.id === sessionId)?.programme_id ?? null;
  // Re-mount all step hooks when sessionId changes by keying the inner content.
  // (Hooks already have useEffect on sessionId, but keying guarantees a clean reset of local UI state.)
  return (
    <PipelineInner
      key={sessionId ?? "no-session"}
      sessionId={sessionId}
      programmeId={programmeId}
      refreshSessions={refreshSessions}
    />
  );
};

interface PipelineInnerProps {
  sessionId: string | null;
  programmeId: string | null;
  refreshSessions: () => Promise<void>;
}

const PipelineInner = ({ sessionId, programmeId, refreshSessions }: PipelineInnerProps) => {
  const stepA1 = useStepA1({ sessionId });
  const stepA2 = useInterpretation({ sessionId });
  const stepA3 = useSearch({ sessionId });
  const stepA4 = useAnalysis({ sessionId });
  const stepA5 = useDatabaseCheck({ sessionId });
  const [showExamples, setShowExamples] = useState(false);

  const [lockedA2Output, setLockedA2Output] = useState<{
    interpretation: Interpretation | null;
    clarificationPoints: ClarificationPoint[];
  } | null>(null);
  const [lockedA3Output, setLockedA3Output] = useState<LockedA3Output | null>(null);
  const [lockedA4Output, setLockedA4Output] = useState<LockedA4Output | null>(null);

  const hasContent = stepA1.contextText.trim() !== "" || stepA1.attachments.length > 0;

  useEffect(() => {
    if (hasContent) setShowExamples(false);
  }, [hasContent]);

  const prevA2Status = useRef(stepA2.status);
  const prevA3Status = useRef(stepA3.status);
  const prevA1Status = useRef(stepA1.status);

  // Auto-name session when A1 transitions to "locked"
  useEffect(() => {
    const justLocked = prevA1Status.current !== "locked" && stepA1.status === "locked";
    if (justLocked && sessionId) {
      const text = stepA1.contextText.trim();
      if (text) {
        (async () => {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data: existing } = await supabase
            .from("search_sessions")
            .select("name")
            .eq("id", sessionId)
            .maybeSingle();
          if (existing && (!existing.name || existing.name.trim() === "")) {
            const name = text.substring(0, 50).trim();
            await supabase.from("search_sessions").update({ name }).eq("id", sessionId);
            await refreshSessions();
          }
        })();
      }
    }
    prevA1Status.current = stepA1.status;
  }, [stepA1.status, stepA1.contextText, sessionId, refreshSessions]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("session_step_states")
        .select("step,status,locked_output")
        .eq("session_id", sessionId)
        .in("step", ["A2", "A3", "A4"])
        .eq("status", "locked");
      if (cancelled || !data) return;
      const a2 = data.find((r) => r.step === "A2");
      if (a2?.locked_output) {
        const out = a2.locked_output as { interpretation?: Interpretation; clarificationPoints?: ClarificationPoint[] };
        if (out.interpretation) {
          setLockedA2Output({
            interpretation: out.interpretation,
            clarificationPoints: out.clarificationPoints || [],
          });
        }
      }
      const a3 = data.find((r) => r.step === "A3");
      if (a3?.locked_output) {
        const out = a3.locked_output as { roleResults?: RoleSearchResult[] };
        if (out.roleResults) setLockedA3Output({ roleResults: out.roleResults });
      }
      const a4 = data.find((r) => r.step === "A4");
      if (a4?.locked_output) {
        const out = a4.locked_output as { roleProgress?: RoleAnalysisProgress[] };
        if (out.roleProgress) setLockedA4Output({ roleProgress: out.roleProgress });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (prevA2Status.current !== "locked" && stepA2.status === "locked" && stepA2.interpretation) {
      setLockedA2Output({
        interpretation: stepA2.interpretation,
        clarificationPoints: stepA2.clarificationPoints,
      });
    }
    if (prevA2Status.current === "locked" && stepA2.status !== "locked") {
      setLockedA2Output(null);
    }
    prevA2Status.current = stepA2.status;
  }, [stepA2.status, stepA2.interpretation, stepA2.clarificationPoints]);

  useEffect(() => {
    if (prevA3Status.current !== "locked" && stepA3.status === "locked") {
      setLockedA3Output({ roleResults: stepA3.orderedRoles });
    }
    if (prevA3Status.current === "locked" && stepA3.status !== "locked") {
      setLockedA3Output(null);
    }
    prevA3Status.current = stepA3.status;
  }, [stepA3.status, stepA3.orderedRoles]);

  const prevA4Status = useRef(stepA4.status);
  useEffect(() => {
    if (prevA4Status.current !== "locked" && stepA4.status === "locked") {
      setLockedA4Output({ roleProgress: stepA4.orderedRoles });
    }
    if (prevA4Status.current === "locked" && stepA4.status !== "locked") {
      setLockedA4Output(null);
    }
    prevA4Status.current = stepA4.status;
  }, [stepA4.status, stepA4.orderedRoles]);

  const handleUnlockWithCascade = useCallback(
    async (stepNumber: number) => {
      const downstreamResets: Array<() => Promise<void>> = [];
      if (stepNumber <= 1) downstreamResets.push(stepA2.reset);
      if (stepNumber <= 2) downstreamResets.push(stepA3.reset);
      if (stepNumber <= 3) downstreamResets.push(stepA4.reset);
      if (stepNumber <= 4) downstreamResets.push(stepA5.reset);

      if (stepNumber <= 2) setLockedA2Output(null);

      await Promise.all(downstreamResets.map((fn) => fn()));

      switch (stepNumber) {
        case 1: await stepA1.unlock(); break;
        case 2: await stepA2.unlock(); break;
        case 3: await stepA3.unlock(); break;
        case 4: await stepA4.unlock(); break;
        case 5: await stepA5.unlock(); break;
      }
    },
    [stepA1, stepA2, stepA3, stepA4, stepA5]
  );

  const downstreamNamesForStep = useMemo(() => {
    const a2Has = stepA2.status !== "not_started";
    const a3Has = stepA3.status !== "not_started";
    const a4Has = stepA4.status !== "not_started";
    const a5Has = stepA5.status !== "not_started";
    return {
      1: [a2Has && STEP_NAMES[2], a3Has && STEP_NAMES[3], a4Has && STEP_NAMES[4], a5Has && STEP_NAMES[5]].filter(Boolean) as string[],
      2: [a3Has && STEP_NAMES[3], a4Has && STEP_NAMES[4], a5Has && STEP_NAMES[5]].filter(Boolean) as string[],
      3: [a4Has && STEP_NAMES[4], a5Has && STEP_NAMES[5]].filter(Boolean) as string[],
      4: [a5Has && STEP_NAMES[5]].filter(Boolean) as string[],
      5: [] as string[],
    };
  }, [stepA2.status, stepA3.status, stepA4.status, stepA5.status]);

  const devStep = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("dev")
    : null;

  const isStep1Active = stepA1.status === "editing";
  const isStep1Locked = stepA1.status === "locked";
  const isStep2Locked = stepA2.status === "locked";
  const isStep3Locked = stepA3.status === "locked";
  const isStep4Locked = stepA4.status === "locked";

  const isStep2Compact =
    stepA2.status === "not_started" && !isStep1Locked && !stepA2.error && devStep !== "step2";
  const isStep3Compact =
    stepA3.status === "not_started" && !isStep2Locked && !stepA3.error && devStep !== "step3";
  const isStep4Compact =
    stepA4.status === "not_started" && !isStep3Locked && !stepA4.error && devStep !== "step4";
  const isStep5Compact =
    stepA5.status === "not_started" && !isStep4Locked && !stepA5.error && devStep !== "step5";

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={75} minSize={50}>
          <main className="h-full flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">
                <ProgrammeContextBanner sessionId={sessionId} programmeId={programmeId} />
                <StepContainer
                  stepNumber={1}
                  title="Define Your Need"
                  status={stepA1.status}
                  isActive={isStep1Active}
                >
                  {isStep1Active && (
                    <div className="space-y-2 mb-6">
                      <h1 className="text-[2.125rem] font-light tracking-[0.03em] leading-[1.2] text-foreground">
                        Define Your Need
                      </h1>
                      <p className="text-body text-foreground-secondary">
                        Describe what you're looking for, or add context to your attachments below...
                      </p>
                    </div>
                  )}

                  <NeedInput
                    contextText={stepA1.contextText}
                    attachments={stepA1.attachments}
                    status={stepA1.status}
                    error={stepA1.error}
                    canLock={stepA1.canLock}
                    sessionId={sessionId}
                    onContextTextChange={stepA1.setContextText}
                    onAddAttachment={stepA1.addAttachment}
                    onRemoveAttachment={stepA1.removeAttachment}
                    onError={stepA1.setError}
                    onLock={stepA1.lock}
                    onUnlock={() => handleUnlockWithCascade(1)}
                    downstreamStepNames={downstreamNamesForStep[1]}
                  />

                  {isStep1Active && (
                    <div className="mt-4">
                      <button
                        onClick={() => setShowExamples(!showExamples)}
                        className="text-body-sm text-foreground-muted hover:text-foreground-secondary transition-colors"
                      >
                        {showExamples ? "Hide examples" : "View example searches"}
                      </button>

                      <div
                        className={`grid grid-cols-2 gap-3 overflow-hidden transition-all duration-200 ${
                          showExamples ? "mt-3 max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        {EXAMPLE_SEARCHES.map((card) => (
                          <ExampleSearchCard
                            key={card.label}
                            label={card.label}
                            onClick={() => stepA1.setContextText(card.text)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </StepContainer>

                {isStep2Compact ? (
                  <CompactStepIndicator stepNumber={2} title="Interpretation & Targets" status="not_started" />
                ) : (
                  <InterpretationStep
                    hook={stepA2}
                    step1Locked={isStep1Locked}
                    contextText={stepA1.contextText}
                    attachments={stepA1.attachments}
                    sessionId={sessionId}
                    onUnlock={() => handleUnlockWithCascade(2)}
                    downstreamStepNames={downstreamNamesForStep[2]}
                  />
                )}

                {isStep3Compact ? (
                  <CompactStepIndicator stepNumber={3} title="Search" status="not_started" />
                ) : (
                  <SearchStep
                    hook={stepA3}
                    interpretation={lockedA2Output?.interpretation ?? null}
                    step2Locked={isStep2Locked}
                    onUnlock={() => handleUnlockWithCascade(3)}
                    downstreamStepNames={downstreamNamesForStep[3]}
                  />
                )}

                {isStep4Compact ? (
                  <CompactStepIndicator stepNumber={4} title="Deep Analysis" status="not_started" />
                ) : (
                  <AnalysisStep
                    hook={stepA4}
                    interpretation={lockedA2Output?.interpretation ?? null}
                    searchHook={stepA3}
                    step3Locked={isStep3Locked}
                    onUnlock={() => handleUnlockWithCascade(4)}
                    downstreamStepNames={downstreamNamesForStep[4]}
                  />
                )}

                {isStep5Compact ? (
                  <CompactStepIndicator stepNumber={5} title="Database Check" status="not_started" />
                ) : (
                  <DatabaseCheckStep
                    hook={stepA5}
                    analysisHook={stepA4}
                    searchHook={stepA3}
                    step4Locked={isStep4Locked}
                    onUnlock={() => handleUnlockWithCascade(5)}
                    downstreamStepNames={downstreamNamesForStep[5]}
                  />
                )}
              </div>
            </div>

            <StatusBar
              found={stepA3.totalFound}
              included={stepA3.totalIncluded}
              savedForLater={stepA3.totalSavedForLater}
            />
          </main>
        </ResizablePanel>

        <ResizableHandle className="w-px bg-transparent hover:bg-border-accent/30 transition-colors data-[resize-handle-active]:bg-border-accent/50" />

        <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
          <AxisSidebar clarificationPoints={stepA2.clarificationPoints} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default PipelineView;
