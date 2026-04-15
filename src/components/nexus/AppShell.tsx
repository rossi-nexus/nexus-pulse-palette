import TopBar from "./TopBar";
import StepContainer from "./StepContainer";
import AxisSidebar from "./AxisSidebar";
import StatusBar from "./StatusBar";

const STEPS = [
  { stepNumber: 1, title: "Define Your Need", status: "editing" as const },
  { stepNumber: 2, title: "Interpretation & Targets", status: "not_started" as const },
  { stepNumber: 3, title: "Search", status: "not_started" as const },
  { stepNumber: 4, title: "Deep Analysis", status: "not_started" as const },
] as const;

const AppShell = () => (
  <div className="h-screen flex flex-col bg-background overflow-hidden">
    <TopBar />

    <div className="flex flex-1 min-h-0">
      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0">
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

      {/* Axis sidebar — fixed right panel */}
      <div className="w-[340px] shrink-0">
        <AxisSidebar />
      </div>
    </div>
  </div>
);

export default AppShell;
