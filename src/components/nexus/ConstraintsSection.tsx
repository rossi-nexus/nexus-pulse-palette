import { useState } from "react";
import { Plus } from "lucide-react";
import type { Constraints, SourcingIntent, ResiliencePosture, ChokepointConcern } from "@/types/interpretation";
import { TagInput } from "@/components/nexus/TagInput";

interface ConstraintsSectionProps {
  constraints: Constraints;
  onUpdate: (type: string, value: any) => void;
}

// SX-02 — option labels for new dimensions.
const SOURCING_INTENT_OPTIONS: { value: SourcingIntent; label: string }[] = [
  { value: "unrestricted", label: "Unrestricted — global, best-fit wins" },
  { value: "local", label: "Local — sub-national / same region" },
  { value: "national", label: "National — domestic sourcing required (sovereignty)" },
  { value: "regional", label: "Regional — e.g. Nordic, Baltic, EU" },
  { value: "allied", label: "Allied — NATO / EU / Five Eyes alignment" },
];

const RESILIENCE_POSTURE_OPTIONS: { value: ResiliencePosture; label: string }[] = [
  { value: "steady_state", label: "Steady-state (peacetime procurement)" },
  { value: "crisis_response", label: "Crisis response (pandemic, disaster, civil emergency)" },
  { value: "wartime_continuity", label: "Wartime continuity (armed conflict, sustained disruption)" },
];

const CHOKEPOINT_OPTIONS: { value: ChokepointConcern; label: string }[] = [
  { value: "single_source", label: "Single source" },
  { value: "foreign_dependency", label: "Foreign dependency" },
  { value: "transport_chokepoint", label: "Transport chokepoint" },
  { value: "energy", label: "Energy" },
  { value: "telecom", label: "Telecom" },
  { value: "raw_materials", label: "Raw materials" },
];


const COUNTRY_NAMES: Record<string, string> = {
  NO: "Norway", SE: "Sweden", FI: "Finland", DK: "Denmark", US: "United States",
  GB: "United Kingdom", DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium",
  PL: "Poland", EE: "Estonia", LV: "Latvia", LT: "Lithuania", IT: "Italy", ES: "Spain",
  PT: "Portugal", CA: "Canada", AU: "Australia", JP: "Japan",
};

const SEARCH_CONTEXT_OPTIONS = [
  { value: "partner_search", label: "Partner Search" },
  { value: "subcontractor_id", label: "Subcontractor ID" },
  { value: "market_mapping", label: "Market Mapping" },
  { value: "supply_chain_analysis", label: "Supply Chain Analysis" },
];

const COMPANY_SIZE_OPTIONS = ["any", "SMB", "Mid-size", "Large"];
const CLASSIFICATION_OPTIONS: { value: string; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "unclassified", label: "Unclassified" },
  { value: "restricted_no", label: "Restricted (NO)" },
  { value: "nato_restricted", label: "NATO Restricted" },
  { value: "confidential_no", label: "Confidential (NO)" },
  { value: "nato_confidential", label: "NATO Confidential" },
  { value: "secret_no", label: "Secret (NO)" },
  { value: "nato_secret", label: "NATO Secret" },
];

// TagInput moved to @/components/nexus/TagInput for reuse across the app.


const ConstraintRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-4 py-2">
    <span className="text-body-sm text-foreground-secondary w-[140px] shrink-0 pt-1">{label}</span>
    <div className="flex-1">{children}</div>
  </div>
);

const ConstraintsSection = ({ constraints, onUpdate }: ConstraintsSectionProps) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const hasConstraint = (type: string) => {
    switch (type) {
      case "geography": return !!constraints.geography;
      case "company_size": return constraints.company_size !== undefined;
      case "security_classification": return !!constraints.security_classification;
      case "readiness": return !!constraints.readiness;
      case "capacity": return !!constraints.capacity;
      case "standards": return !!constraints.standards;
      case "contract_duration": return !!constraints.contract_duration;
      case "search_context": return constraints.search_context !== undefined;
      case "sourcing_intent": return !!constraints.geography?.sourcing_intent;
      case "resilience": return !!constraints.resilience;
      case "value_chain": return !!constraints.value_chain;
      default: return false;
    }
  };

  const addableTypes = [
    { key: "geography", label: "Geography" },
    { key: "sourcing_intent", label: "Sourcing intent" },
    { key: "resilience", label: "Resilience posture" },
    { key: "value_chain", label: "Value chain" },
    { key: "company_size", label: "Company Size" },
    { key: "security_classification", label: "Security Classification" },
    { key: "readiness", label: "Readiness" },
    { key: "capacity", label: "Capacity" },
    { key: "standards", label: "Standards" },
    { key: "contract_duration", label: "Contract Duration" },
    { key: "search_context", label: "Search Context" },
  ].filter(t => !hasConstraint(t.key));

  const addConstraint = (type: string) => {
    if (type === "sourcing_intent") {
      // Sourcing intent lives inside geography; ensure geography exists too.
      onUpdate("geography", { ...(constraints.geography || { countries: [], regions: [], cities: [] }), sourcing_intent: "unrestricted" });
      setShowAddMenu(false);
      return;
    }
    const defaults: Record<string, any> = {
      geography: { countries: [], regions: [], cities: [] },
      company_size: "any",
      security_classification: { required_level: "any" },
      readiness: { max_response_time: "", description: "" },
      capacity: { description: "" },
      standards: { required: [], preferred: [] },
      contract_duration: { duration: "" },
      search_context: "partner_search",
      resilience: { posture: "steady_state", scenarios: [] },
      value_chain: { sensitive: true, chokepoint_concerns: [], notes: "" },
    };
    onUpdate(type, defaults[type]);
    setShowAddMenu(false);
  };


  return (
    <div className="space-y-3">
      <h3 className="text-body-lg font-semibold text-foreground">Constraints</h3>

      <div className="divide-y divide-border-subtle">
        {/* Geography */}
        {constraints.geography && (
          <ConstraintRow label="Geography">
            <div className="space-y-2">
              <div>
                <span className="text-caption text-foreground-muted">Countries</span>
                <TagInput
                  tags={constraints.geography.countries || []}
                  onChange={(countries) => onUpdate("geography", { ...constraints.geography, countries })}
                  placeholder="Add country code…"
                  renderTag={(code) => COUNTRY_NAMES[code] || code}
                />
              </div>
              <div>
                <span className="text-caption text-foreground-muted">Regions</span>
                <TagInput
                  tags={constraints.geography.regions || []}
                  onChange={(regions) => onUpdate("geography", { ...constraints.geography, regions })}
                  placeholder="Add region…"
                />
              </div>
            </div>
          </ConstraintRow>
        )}

        {/* Company Size */}
        {constraints.company_size !== undefined && (
          <ConstraintRow label="Company Size">
            <select
              value={constraints.company_size}
              onChange={(e) => onUpdate("company_size", e.target.value)}
              className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none"
            >
              {COMPANY_SIZE_OPTIONS.map(o => <option key={o} value={o}>{o === "any" ? "Any" : o}</option>)}
            </select>
          </ConstraintRow>
        )}

        {/* Security Classification */}
        {constraints.security_classification && (
          <ConstraintRow label="Security Classification">
            <div className="space-y-1">
              <select
                value={constraints.security_classification.required_level || "any"}
                onChange={(e) => onUpdate("security_classification", { required_level: e.target.value })}
                className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              >
                {CLASSIFICATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-caption text-foreground-muted">Hard filter — actors below this level are excluded</p>
            </div>
          </ConstraintRow>
        )}

        {/* Readiness */}
        {constraints.readiness && (
          <ConstraintRow label="Readiness">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={constraints.readiness.max_response_time || ""}
                onChange={(e) => onUpdate("readiness", { ...constraints.readiness, max_response_time: e.target.value })}
                placeholder="e.g. 12 months"
                className="h-8 px-2 w-[140px] rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              />
              <input
                type="text"
                value={constraints.readiness.description || ""}
                onChange={(e) => onUpdate("readiness", { ...constraints.readiness, description: e.target.value })}
                placeholder="Description…"
                className="h-8 px-2 flex-1 rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              />
            </div>
          </ConstraintRow>
        )}

        {/* Standards */}
        {constraints.standards && (
          <ConstraintRow label="Standards">
            <div className="space-y-2">
              <div>
                <span className="text-caption text-foreground-muted">Required</span>
                <TagInput
                  tags={constraints.standards.required || []}
                  onChange={(required) => onUpdate("standards", { ...constraints.standards, required })}
                  placeholder="Add standard…"
                />
              </div>
              <div>
                <span className="text-caption text-foreground-muted">Preferred</span>
                <TagInput
                  tags={constraints.standards.preferred || []}
                  onChange={(preferred) => onUpdate("standards", { ...constraints.standards, preferred })}
                  placeholder="Add standard…"
                />
              </div>
            </div>
          </ConstraintRow>
        )}

        {/* Contract Duration (P12: typed) */}
        {constraints.contract_duration && (
          <ConstraintRow label="Contract Duration">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Typed chip preview */}
              {typeof constraints.contract_duration.value === "number" && constraints.contract_duration.unit && (
                <span className="px-1.5 py-0.5 rounded-sharp border border-accent-teal/30 bg-accent-teal/5 text-accent-teal text-[10px] font-mono uppercase tracking-wider">
                  {(() => {
                    const t = constraints.contract_duration!.type;
                    const prefix = t === "minimum" ? "≥" : t === "maximum" ? "≤" : t === "fixed" ? "= " : "~";
                    return `${prefix}${constraints.contract_duration!.value} ${constraints.contract_duration!.unit}${(constraints.contract_duration!.value ?? 0) === 1 ? "" : "s"}`;
                  })()}
                </span>
              )}
              <input
                type="number"
                min={0}
                value={constraints.contract_duration.value ?? ""}
                onChange={(e) =>
                  onUpdate("contract_duration", {
                    ...constraints.contract_duration,
                    value: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                placeholder="value"
                className="h-8 px-2 w-[80px] rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              />
              <select
                value={constraints.contract_duration.unit ?? "year"}
                onChange={(e) =>
                  onUpdate("contract_duration", { ...constraints.contract_duration, unit: e.target.value as any })
                }
                className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              >
                <option value="year">years</option>
                <option value="month">months</option>
              </select>
              <select
                value={constraints.contract_duration.type ?? "expected"}
                onChange={(e) =>
                  onUpdate("contract_duration", { ...constraints.contract_duration, type: e.target.value as any })
                }
                className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              >
                <option value="minimum">minimum</option>
                <option value="expected">expected</option>
                <option value="maximum">maximum</option>
                <option value="fixed">fixed</option>
              </select>
              <input
                type="text"
                value={constraints.contract_duration.duration || ""}
                onChange={(e) => onUpdate("contract_duration", { ...constraints.contract_duration, duration: e.target.value })}
                placeholder="original phrase"
                className="h-8 px-2 w-[160px] rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              />
            </div>
          </ConstraintRow>
        )}

        {/* Search Context */}
        {constraints.search_context !== undefined && (
          <ConstraintRow label="Search Context">
            <select
              value={constraints.search_context}
              onChange={(e) => onUpdate("search_context", e.target.value)}
              className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none"
            >
              {SEARCH_CONTEXT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </ConstraintRow>
        )}

        {/* Capacity */}
        {constraints.capacity && (
          <ConstraintRow label="Capacity">
            <input
              type="text"
              value={constraints.capacity.description || ""}
              onChange={(e) => onUpdate("capacity", { ...constraints.capacity, description: e.target.value })}
              placeholder="Description…"
              className="h-8 px-2 flex-1 w-full rounded border border-border bg-surface text-body-sm text-foreground outline-none"
            />
          </ConstraintRow>
        )}

        {/* SX-02 — Sourcing Intent */}
        {constraints.geography?.sourcing_intent && (
          <ConstraintRow label="Sourcing intent">
            <div className="space-y-1">
              <select
                value={constraints.geography.sourcing_intent}
                onChange={(e) => onUpdate("geography", { ...constraints.geography, sourcing_intent: e.target.value as SourcingIntent })}
                className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none w-full max-w-md"
              >
                {SOURCING_INTENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {constraints.geography.sourcing_intent_rationale && (
                <p className="text-caption text-foreground-muted italic">
                  {constraints.geography.sourcing_intent_rationale}
                </p>
              )}
            </div>
          </ConstraintRow>
        )}

        {/* SX-02 — Resilience Posture */}
        {constraints.resilience && (
          <ConstraintRow label="Resilience posture">
            <div className="space-y-2">
              <select
                value={constraints.resilience.posture || "steady_state"}
                onChange={(e) => onUpdate("resilience", { ...constraints.resilience, posture: e.target.value as ResiliencePosture })}
                className="h-8 px-2 rounded border border-border bg-surface text-body-sm text-foreground outline-none w-full max-w-md"
              >
                {RESILIENCE_POSTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div>
                <span className="text-caption text-foreground-muted">Scenarios</span>
                <TagInput
                  tags={constraints.resilience.scenarios || []}
                  onChange={(scenarios) => onUpdate("resilience", { ...constraints.resilience, scenarios })}
                  placeholder="Add scenario…"
                />
              </div>
            </div>
          </ConstraintRow>
        )}

        {/* SX-02 — Value Chain */}
        {constraints.value_chain && (
          <ConstraintRow label="Value chain">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-body-sm text-foreground-secondary">
                <input
                  type="checkbox"
                  checked={!!constraints.value_chain.sensitive}
                  onChange={(e) => onUpdate("value_chain", { ...constraints.value_chain, sensitive: e.target.checked })}
                />
                Sensitive value chain
              </label>
              <div>
                <span className="text-caption text-foreground-muted">Chokepoint concerns</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {CHOKEPOINT_OPTIONS.map(opt => {
                    const active = (constraints.value_chain?.chokepoint_concerns || []).includes(opt.value);
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => {
                          const current = constraints.value_chain?.chokepoint_concerns || [];
                          const next = active ? current.filter(c => c !== opt.value) : [...current, opt.value];
                          onUpdate("value_chain", { ...constraints.value_chain, chokepoint_concerns: next });
                        }}
                        className={
                          "text-[11px] font-mono px-2 py-0.5 rounded-sharp border transition-colors " +
                          (active
                            ? "bg-accent-teal/15 text-accent-teal border-accent-teal/40"
                            : "bg-surface text-foreground-muted border-border-subtle hover:text-foreground-secondary")
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                type="text"
                value={constraints.value_chain.notes || ""}
                onChange={(e) => onUpdate("value_chain", { ...constraints.value_chain, notes: e.target.value })}
                placeholder="Notes…"
                className="h-8 px-2 w-full rounded border border-border bg-surface text-body-sm text-foreground outline-none"
              />
            </div>
          </ConstraintRow>
        )}
      </div>


      {/* Add constraint */}
      {addableTypes.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 text-body-sm text-foreground-muted hover:text-foreground-secondary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add constraint
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 py-1 bg-surface border border-border rounded-card shadow-lg z-10 min-w-[180px]">
              {addableTypes.map(t => (
                <button
                  key={t.key}
                  onClick={() => addConstraint(t.key)}
                  className="w-full text-left px-3 py-1.5 text-body-sm text-foreground-secondary hover:bg-elevated transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConstraintsSection;
