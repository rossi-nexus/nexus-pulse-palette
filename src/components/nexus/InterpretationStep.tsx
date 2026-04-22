import { useState } from "react";
import { Loader2, Lock, Unlock, FlaskConical, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import StepContainer from "./StepContainer";
import SummarySection from "./SummarySection";
import RolesSection from "./RolesSection";
import ConstraintsSection from "./ConstraintsSection";
import ReviewToggle from "./ReviewToggle";
import UnlockConfirmDialog from "./UnlockConfirmDialog";
import type { NeedDescription, NeedAttachment } from "@/types/need-description";
import type { useInterpretation } from "@/hooks/useInterpretation";

const MOCK_NEED: NeedDescription = {
  id: "mock-need-001",
  session_id: "mock-session-001",
  context_text:
    "Establish comprehensive surveillance capacity in the Narvik area related to allied reception and evacuation from Sweden and Finland. The solution should cover land, sea, and air, and be operational within 12 months with a duration of at least 3 years. Both complete systems and actors with expertise in integration, system management, and operational operation are sought. The solution must be able to handle security levels up to CONFIDENTIAL.",
  attachments: [],
  locked_at: new Date().toISOString(),
};

interface InterpretationStepProps {
  hook: ReturnType<typeof useInterpretation>;
  step1Locked: boolean;
  contextText: string;
  attachments: NeedAttachment[];
  sessionId: string | null;
  /** Cascade-aware unlock from AppShell; the hook's own unlock is no longer called directly. */
  onUnlock: () => void;
  /** Names of downstream steps with data — populates the confirmation dialog. */
  downstreamStepNames: string[];
}

const InterpretationStep = ({
  hook,
  step1Locked,
  contextText,
  attachments,
  sessionId,
  onUnlock,
  downstreamStepNames,
}: InterpretationStepProps) => {
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const handleUnlockClick = () => {
    if (downstreamStepNames.length > 0) setUnlockDialogOpen(true);
    else onUnlock();
  };
  const {
    interpretation,
    status,
    error,
    processingMessage,
    pendingCount,
    populatingRoleIds,
    populationFailedRoleIds,
    runInterpretation,
    rejectSummaryPoint,
    addSummaryPoint,
    editSummaryPoint,
    rejectRole,
    addRole,
    editRoleName,
    toggleSelection,
    reorderRoles,
    updateConstraint,
    acceptAllPending,
    lock,
  } = hook;

  const showDev =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("dev") === "step2";

  const runFromStep1 = () => {
    const need: NeedDescription = {
      id: crypto.randomUUID(),
      session_id: sessionId ?? "anonymous",
      attachments,
      locked_at: new Date().toISOString(),
      ...(contextText.trim() ? { context_text: contextText.trim() } : {}),
    };
    runInterpretation(need);
  };

  // Not started
  if (status === "not_started") {
    return (
      <StepContainer stepNumber={2} title="Interpretation & Targets" status="not_started" isActive={step1Locked}>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive mb-2 max-w-md text-center">
              {error}
            </div>
          )}
          {step1Locked && (
            <Button onClick={runFromStep1} className="gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Run interpretation
            </Button>
          )}
          {showDev && (
            <Button
              onClick={() => runInterpretation(MOCK_NEED)}
              variant="outline"
              className="gap-2 text-foreground-muted border-border hover:text-foreground"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              DEV: Run with test data
            </Button>
          )}
        </div>
      </StepContainer>
    );
  }

  // Processing
  if (status === "processing") {
    return (
      <StepContainer stepNumber={2} title="Interpretation & Targets" status="editing" isActive>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-6 h-6 text-accent-teal animate-spin" />
          <p className="text-body-sm text-foreground-secondary">{processingMessage}</p>
        </div>
      </StepContainer>
    );
  }

  // Locked
  if (status === "locked" && interpretation) {
    const visibleSummary = interpretation.summary.filter(s => s.status !== "rejected");
    const visibleRoles = interpretation.roles.filter(r => r.status !== "rejected");

    return (
      <StepContainer stepNumber={2} title="Interpretation & Targets" status="locked">
        <div className="space-y-3">
          <div>
            <span className="text-caption text-foreground-muted">Summary:</span>
            <ul className="list-disc list-inside text-body-sm text-foreground-secondary mt-1">
              {visibleSummary.map(s => <li key={s.id}>{s.text}</li>)}
            </ul>
          </div>
          <p className="text-body-sm text-foreground-secondary">
            {visibleRoles.length} roles defined
          </p>
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

  // Editing
  if (status === "editing" && interpretation) {
    return (
      <StepContainer stepNumber={2} title="Interpretation & Targets" status="editing" isActive>
        <div className="space-y-8">
          <SummarySection
            points={interpretation.summary}
            roles={interpretation.roles}
            onEdit={editSummaryPoint}
            onDelete={rejectSummaryPoint}
            onAdd={addSummaryPoint}
          />

          <RolesSection
            roles={interpretation.roles}
            onEdit={editRoleName}
            onDelete={rejectRole}
            onAdd={(name) => addRole(name, contextText)}
            onToggleSelection={toggleSelection}
            onReorder={reorderRoles}
            populatingRoleIds={populatingRoleIds}
            populationFailedRoleIds={populationFailedRoleIds}
          />

          <ConstraintsSection
            constraints={interpretation.constraints}
            onUpdate={updateConstraint}
          />

          {/* Action row — Lock is always enabled once interpretation has loaded.
              Unreviewed items are kept as-is; user can unlock later to refine. */}
          <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
            <div>
              {pendingCount > 0 && (
                <span className="text-body-sm text-foreground-muted">
                  {pendingCount} item{pendingCount !== 1 ? "s" : ""} unreviewed (will be kept as-is)
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => {
                  acceptAllPending();
                  lock();
                }}
                className="gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock interpretation
              </Button>
            </div>
          </div>
        </div>
      </StepContainer>
    );
  }

  return null;
};

export default InterpretationStep;
