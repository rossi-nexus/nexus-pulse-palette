import TopBar from "./TopBar";
import StepContainer from "./StepContainer";
import AxisSidebar from "./AxisSidebar";
import StatusBar from "./StatusBar";
import NeedInput from "./NeedInput";
import ExampleSearchCard from "./ExampleSearchCard";
import CompactStepIndicator from "./CompactStepIndicator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useSession } from "@/hooks/useSession";
import { useStepA1 } from "@/hooks/useStepA1";
import { EXAMPLE_SEARCHES } from "@/constants/exampleSearches";
import { cn } from "@/lib/utils";

const AppShell = () => {
  const { sessionId } = useSession();
  const stepA1 = useStepA1({ sessionId });

  const isLanding =
    stepA1.contextText.trim() === "" &&
    stepA1.attachments.length === 0 &&
    stepA1.status === "editing";

  const isStep1Locked = stepA1.status === "locked";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar />

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Main content area */}
        <ResizablePanel defaultSize={75} minSize={50}>
          <main className="h-full flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">

                {/* === Landing State === */}
                {isLanding && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Heading & subtitle */}
                    <div className="space-y-2">
                      <h1 className="text-h1 font-semibold text-foreground">Define Your Need</h1>
                      <p className="text-body-sm text-foreground-muted">
                        Describe what you're looking for, or add context to your attachments below...
                      </p>
                    </div>

                    {/* NeedInput without step container frame */}
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

                    {/* Example search cards — 2×2 grid */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
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

                {/* === Working State === */}
                {!isLanding && (
                  <>
                    {/* Step 1 — full container */}
                    <StepContainer
                      stepNumber={1}
                      title="Define Your Need"
                      status={stepA1.status}
                    >
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
                    </StepContainer>
                  </>
                )}

                {/* Steps 2–4: compact indicators (expand when active — future prompts) */}
                <CompactStepIndicator stepNumber={2} title="Interpretation & Targets" status="not_started" />
                <CompactStepIndicator stepNumber={3} title="Search" status="not_started" />
                <CompactStepIndicator stepNumber={4} title="Deep Analysis" status="not_started" />

                {/* Database Check — special step */}
                <div className="pt-4 border-t border-border-subtle">
                  <StepContainer
                    title="Database Check"
                    status="not_started"
                    isSpecial
                  />
                </div>
              </div>
            </div>

            <StatusBar />
          </main>
        </ResizablePanel>

        {/* Resize handle */}
        <ResizableHandle className="w-px bg-transparent hover:bg-border-accent/30 transition-colors data-[resize-handle-active]:bg-border-accent/50" />

        {/* Axis sidebar */}
        <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
          <AxisSidebar />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default AppShell;
