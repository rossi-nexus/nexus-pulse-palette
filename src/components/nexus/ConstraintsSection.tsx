import { useState } from "react";
import { Plus } from "lucide-react";
import type { Constraints } from "@/types/interpretation";
import { TagInput } from "@/components/nexus/TagInput";

interface ConstraintsSectionProps {
  constraints: Constraints;
  onUpdate: (type: string, value: any) => void;
}

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
      default: return false;
    }
  };

  const addableTypes = [
    { key: "geography", label: "Geography" },
    { key: "company_size", label: "Company Size" },
    { key: "security_classification", label: "Security Classification" },
    { key: "readiness", label: "Readiness" },
    { key: "capacity", label: "Capacity" },
    { key: "standards", label: "Standards" },
    { key: "contract_duration", label: "Contract Duration" },
    { key: "search_context", label: "Search Context" },
  ].filter(t => !hasConstraint(t.key));

  const addConstraint = (type: string) => {
    const defaults: Record<string, any> = {
      geography: { countries: [], regions: [], cities: [] },
      company_size: "any",
      security_classification: { required_level: "any" },
      readiness: { max_response_time: "", description: "" },
      capacity: { description: "" },
      standards: { required: [], preferred: [] },
      contract_duration: { duration: "" },
      search_context: "partner_search",
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

        {/* Contract Duration */}
        {constraints.contract_duration && (
          <ConstraintRow label="Contract Duration">
            <input
              type="text"
              value={constraints.contract_duration.duration || ""}
              onChange={(e) => onUpdate("contract_duration", { duration: e.target.value })}
              placeholder="e.g. 3 years"
              className="h-8 px-2 w-[200px] rounded border border-border bg-surface text-body-sm text-foreground outline-none"
            />
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
