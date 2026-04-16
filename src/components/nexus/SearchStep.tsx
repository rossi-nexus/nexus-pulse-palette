import { Loader2, Lock, Unlock, FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import StepContainer from "./StepContainer";
import RoleProgressBox from "./RoleProgressBox";
import ActorCard from "./ActorCard";
import type { useSearch } from "@/hooks/useSearch";
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
}

const SearchStep = ({ hook, interpretation, step2Locked }: SearchStepProps) => {
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
    setExpandedRoleId,
    startSearch,
    includeActor,
    saveForLater,
    undoTriage,
    lock,
    unlock,
  } = hook;

  const expandedResult = orderedRoles.find(r => r.role_id === expandedRoleId);

  // Not started
  if (status === "not_started") {
    return (
      <StepContainer stepNumber={3} title="Search" status="not_started" isActive={step2Locked}>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {error && (
            <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive mb-2 max-w-md text-center">
              {error}
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
          <Button
            onClick={() => startSearch(MOCK_INTERPRETATION)}
            variant="outline"
            className="gap-2 text-foreground-muted border-border hover:text-foreground"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            DEV: Run test search
          </Button>
        </div>
      </StepContainer>
    );
  }

  // Locked
  if (status === "locked") {
    return (
      <StepContainer stepNumber={3} title="Search" status="locked">
        <div className="space-y-3">
          <p className="text-body-sm text-foreground-secondary">
            {totalIncluded} actors included · {totalSavedForLater} saved for later · {totalFound} total found
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={unlock} className="gap-2 text-foreground-muted hover:text-foreground">
              <Unlock className="w-3.5 h-3.5" />
              Unlock
            </Button>
          </div>
        </div>
      </StepContainer>
    );
  }

  // Searching or Reviewing
  return (
    <StepContainer stepNumber={3} title="Search" status="editing" isActive>
      <div className="space-y-6">
        {/* Role progress boxes — horizontal row */}
        <div className="flex gap-2 overflow-x-auto pb-2">
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

        {/* Expanded role actors */}
        {expandedResult && expandedResult.actors.length > 0 && (
          <div className="space-y-3">
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

            <div className="space-y-2">
              {expandedResult.actors.map(actor => (
                <ActorCard
                  key={actor.id}
                  actor={actor}
                  roleId={expandedResult.role_id}
                  onInclude={includeActor}
                  onSaveForLater={saveForLater}
                  onUndo={undoTriage}
                />
              ))}
            </div>
          </div>
        )}

        {expandedResult?.error && (
          <div className="px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-caption text-destructive">
            {expandedResult.error}
          </div>
        )}

        {/* Summary + lock */}
        {status === "reviewing" && (
          <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
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
              disabled={!canLock}
              className="gap-2"
              title={!canLock ? "Decide on all actors before locking" : undefined}
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
