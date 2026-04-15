/** A2 — Interpretation & Targets: the AI-structured interpretation of the user's need */

export interface OntologySelection {
  entryId: string;
  rawName: string;
  categoryName?: string;
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
  maxDistanceKm?: number;
  referencePoint?: string;
}

export interface ClassificationConstraint {
  minimumLevel?: string;
  acceptedSystems?: string[];
}

export interface CapacityConstraint {
  attributeType: string;
  minValue?: number;
  maxValue?: number;
  unit?: string;
}

export interface StandardConstraint {
  standardName: string;
  required: boolean;
}

export interface Constraints {
  geographic?: GeographicConstraint;
  classification?: ClassificationConstraint;
  capacity?: CapacityConstraint[];
  standards?: StandardConstraint[];
  timeline?: string;
  budget?: string;
}

export interface Role {
  id: string;
  label: string;
  description: string;
  targets: RoleTargets;
  constraints: Constraints;
  priority: number;
}

export interface Interpretation {
  /** Plain-text understanding of the user's need */
  understanding: string;
  /** Structured roles derived from the need */
  roles: Role[];
  /** Any notes from the AI about ambiguity or assumptions */
  notes?: string;
}
