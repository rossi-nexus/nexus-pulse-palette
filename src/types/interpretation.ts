/** A2 — Interpretation & Targets: the AI-structured interpretation of the user's need */

export type ItemSource = 'axis' | 'manual';
export type ItemStatus = 'accepted' | 'rejected' | 'pending';

export interface SummaryPoint {
  id: string;
  text: string;
  source: ItemSource;
  status: ItemStatus;
  /** IDs of roles that address/cover this summary point. Empty array means no role covers it (potential gap). */
  covered_by_roles?: string[];
}

export interface OntologySelection {
  id: string;
  entryId: string;
  rawName: string;
  categoryName?: string;
  categoryType: string;
  selected: boolean;
  source: ItemSource;
  status: ItemStatus;
  is_proposed_new?: boolean;
  proposed_name?: string;
  /** UUID of the sub-category the AI says this proposed-new item best fits under. */
  proposed_category_id?: string;
  /** UUID of an existing ontology entry the AI matched to (instead of proposing new). */
  matched_entry_id?: string;
  /** Optional resolved metadata for the proposed category — populated by surfaces that fetch it (e.g. enrich-from-url wizard). */
  proposed_category_meta?: {
    normalized_name: string;
    description: string | null;
    keywords: string[];
    example_entries: string[];
    co_occurring: { id: string; type: string; normalized_name: string }[];
  };
}

export interface RoleTargets {
  capabilities: OntologySelection[];
  competences: OntologySelection[];
  domains: OntologySelection[];
  productTypes: OntologySelection[];
  serviceTypes: OntologySelection[];
}

export interface GeographicConstraint {
  countries?: string[];
  regions?: string[];
  cities?: string[];
  maxDistanceKm?: number;
  referencePoint?: string;
}

export interface ClassificationConstraint {
  required_level?: string;
  acceptedSystems?: string[];
}

export interface ReadinessConstraint {
  max_response_time?: string;
  description?: string;
}

export interface CapacityConstraint {
  description?: string;
  min_value?: number | null;
  max_value?: number | null;
  unit?: string;
}

export interface StandardsConstraint {
  required?: string[];
  preferred?: string[];
}

export type ContractDurationUnit = "month" | "year";
export type ContractDurationType = "minimum" | "expected" | "maximum" | "fixed";

export interface ContractDurationConstraint {
  /** Legacy free-text fallback. Kept for backward compatibility. */
  duration?: string;
  /** P12 — typed extraction. value+unit+type drive downstream filters. */
  value?: number;
  unit?: ContractDurationUnit;
  type?: ContractDurationType;
}

export interface Constraints {
  geography?: GeographicConstraint;
  company_size?: string;
  security_classification?: ClassificationConstraint;
  readiness?: ReadinessConstraint;
  capacity?: CapacityConstraint;
  standards?: StandardsConstraint;
  contract_duration?: ContractDurationConstraint;
  search_context?: string;
}

export interface RoleDependency {
  id: string;
  depends_on_role_id: string;
  depends_on_role_name: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  reasoning: string;
  targets: RoleTargets;
  constraints: Constraints;
  dependencies: RoleDependency[];
  priority: number;
  source: ItemSource;
  status: ItemStatus;
}

export interface Interpretation {
  id: string;
  /** Summary points describing the need */
  summary: SummaryPoint[];
  /** Structured roles derived from the need */
  roles: Role[];
  /** Global constraints */
  constraints: Constraints;
  /** Any notes from the AI about ambiguity or assumptions */
  notes?: string;
}

export interface ClarificationPoint {
  question: string;
  context: string;
}
