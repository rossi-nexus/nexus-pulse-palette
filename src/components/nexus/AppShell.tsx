import TopBar from "./TopBar";
import StepContainer from "./StepContainer";
import AxisSidebar from "./AxisSidebar";
import StatusBar from "./StatusBar";
import NeedInput from "./NeedInput";
import ExampleSearchCard from "./ExampleSearchCard";
import CompactStepIndicator from "./CompactStepIndicator";
import InterpretationStep from "./InterpretationStep";
import SearchStep from "./SearchStep";
import AnalysisStep from "./AnalysisStep";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useSession } from "@/hooks/useSession";
import { useStepA1 } from "@/hooks/useStepA1";
import { useInterpretation } from "@/hooks/useInterpretation";
import { useSearch } from "@/hooks/useSearch";
import { useAnalysis } from "@/hooks/useAnalysis";
import { EXAMPLE_SEARCHES } from "@/constants/exampleSearches";
import { useState, useEffect, useRef } from "react";
import type { Interpretation, ClarificationPoint } from "@/types/interpretation";

const AppShell = () => {
  const { sessionId } = useSession();
  const stepA1 = useStepA1({ sessionId });
  const stepA2 = useInterpretation({ sessionId });
  const stepA3 = useSearch({ sessionId });
  const stepA4 = useAnalysis({ sessionId });
  const [showExamples, setShowExamples] = useState(false);

  // Locked downstream contract outputs — what downstream steps see.
  // These are populated from DB on init and refreshed when an upstream step locks.
  const [lockedA2Output, setLockedA2Output] = useState<{
    interpretation: Interpretation | null;
    clarificationPoints: ClarificationPoint[];
  } | null>(null);

  const hasContent = stepA1.contextText.trim() !== "" || stepA1.attachments.length > 0;

  // Auto-collapse examples when textarea gets content
  useEffect(() => {
    if (hasContent) setShowExamples(false);
  }, [hasContent]);

  // Track previous A2/A3 status to detect lock/unlock transitions
  const prevA2Status = useRef(stepA2.status);
  const prevA3Status = useRef(stepA3.status);

  // On initial load: read locked A2 output from DB (so contract survives refresh)
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("session_step_states")
        .select("step,status,locked_output")
        .eq("session_id", sessionId)
        .in("step", ["A2"])
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
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Capture locked A2 output when A2 transitions to "locked"
  useEffect(() => {
    if (prevA2Status.current !== "locked" && stepA2.status === "locked" && stepA2.interpretation) {
      setLockedA2Output({
        interpretation: stepA2.interpretation,
        clarificationPoints: stepA2.clarificationPoints,
      });
    }
    // When A2 unlocks, clear its locked output (downstream cascade is a separate prompt)
    if (prevA2Status.current === "locked" && stepA2.status !== "locked") {
      setLockedA2Output(null);
    }
    prevA2Status.current = stepA2.status;
  }, [stepA2.status, stepA2.interpretation, stepA2.clarificationPoints]);

  // Track A3 lock transitions for unlock side-effects (data lives in stepA3 hook itself,
  // and useSearch already restores its own locked roleResults from DB on init).
  useEffect(() => {
    prevA3Status.current = stepA3.status;
  }, [stepA3.status]);

  const devStep = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("dev")
    : null;

  const isStep1Active = stepA1.status === "editing";
  const isStep1Locked = stepA1.status === "locked";
  const isStep2Locked = stepA2.status === "locked";
  const isStep3Locked = stepA3.status === "locked";

  const isStep2Compact =
    stepA2.status === "not_started" && !isStep1Locked && !stepA2.error && devStep !== "step2";
  const isStep3Compact =
    stepA3.status === "not_started" && !isStep2Locked && !stepA3.error && devStep !== "step3";
  const isStep4Compact =
    stepA4.status === "not_started" && !isStep3Locked && !stepA4.error && devStep !== "step4";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar />

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Main content area */}
        <ResizablePanel defaultSize={75} minSize={50}>
          <main className="h-full flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">

                {/* Step 1 — always in container */}
                <StepContainer
                  stepNumber={1}
                  title="Define Your Need"
                  status={stepA1.status}
                  isActive={isStep1Active}
                >
                  {/* Display heading inside container when editing */}
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
                    onUnlock={stepA1.unlock}
                  />

                  {/* Example searches toggle — only in editing state */}
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

                {/* Step 2 — interpretation */}
                {isStep2Compact ? (
                  <CompactStepIndicator stepNumber={2} title="Interpretation & Targets" status="not_started" />
                ) : (
                  <InterpretationStep
                    hook={stepA2}
                    step1Locked={isStep1Locked}
                    contextText={stepA1.contextText}
                    attachments={stepA1.attachments}
                    sessionId={sessionId}
                  />
                )}

                {/* Step 3 — search */}
                {isStep3Compact ? (
                  <CompactStepIndicator stepNumber={3} title="Search" status="not_started" />
                ) : (
                  <SearchStep
                    hook={stepA3}
                    interpretation={lockedA2Output?.interpretation ?? null}
                    step2Locked={isStep2Locked}
                  />
                )}

                {/* Step 4: deep analysis */}
                {isStep4Compact ? (
                  <CompactStepIndicator stepNumber={4} title="Deep Analysis" status="not_started" />
                ) : (
                  <AnalysisStep
                    hook={stepA4}
                    interpretation={lockedA2Output?.interpretation ?? null}
                    searchHook={stepA3}
                    step3Locked={isStep3Locked}
                  />
                )}

                {/* Database Check — compact indicator */}
                <CompactStepIndicator title="Database Check" status="not_started" />
              </div>
            </div>

            <StatusBar
              found={stepA3.totalFound}
              included={stepA3.totalIncluded}
              savedForLater={stepA3.totalSavedForLater}
            />
          </main>
        </ResizablePanel>

        {/* Resize handle */}
        <ResizableHandle className="w-px bg-transparent hover:bg-border-accent/30 transition-colors data-[resize-handle-active]:bg-border-accent/50" />

        {/* Axis sidebar */}
        <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
          <AxisSidebar clarificationPoints={stepA2.clarificationPoints} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default AppShell;
