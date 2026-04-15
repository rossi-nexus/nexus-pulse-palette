import TopBar from "./TopBar";
import StepContainer from "./StepContainer";
import AxisSidebar from "./AxisSidebar";
import StatusBar from "./StatusBar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

const STEPS = [
  { stepNumber: 1, title: "Define Your Need", status: "editing" as const },
  { stepNumber: 2, title: "Interpretation & Targets", status: "not_started" as const },
  { stepNumber: 3, title: "Search", status: "not_started" as const },
  { stepNumber: 4, title: "Deep Analysis", status: "not_started" as const },
] as const;

const AppShell = () => (
  <div className="h-screen flex flex-col bg-background overflow-hidden">
    <TopBar />

    <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
      {/* Main content area */}
      <ResizablePanel defaultSize={75} minSize={50}>
        <main className="h-full flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">
              {STEPS.map((step) => (
                <StepContainer
                  key={step.stepNumber}
                  stepNumber={step.stepNumber}
                  title={step.title}
                  status={step.status}
                />
              ))}

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

export default AppShell;
