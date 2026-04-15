/** A4 — Deep Analysis: enriched analysis of selected actors */

export interface MatchedEntry {
  entryId: string;
  rawName: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: string;
}

export interface MatchedCategory {
  categoryId: string;
  categoryName: string;
  entries: MatchedEntry[];
}

export interface CapabilityAnalysis {
  capabilities: MatchedCategory[];
  competences: MatchedCategory[];
  domains: MatchedCategory[];
  productTypes: MatchedCategory[];
  serviceTypes: MatchedCategory[];
}

export interface ClassificationAnalysis {
  classificationSystem: string;
  levelNormalized: string;
  levelNationalTerm?: string;
  issuingAuthority?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: string;
  validFrom?: string;
  validTo?: string;
}

export interface StandardAnalysis {
  standardName: string;
  standardNumber?: string;
  scope?: string;
  certifyingBody?: string;
  validFrom?: string;
  validTo?: string;
  evidence?: string;
}

export interface CustomerHistoryAnalysis {
  customerName: string;
  description?: string;
  year?: number;
  domain?: string;
  customerSegment?: 'defense' | 'civil_government' | 'commercial' | 'export';
  branchDetail?: string;
  isReference: boolean;
}

export interface CapacityAnalysis {
  attributeType: string;
  valueText: string;
  valueMin?: number;
  valueMax?: number;
  unit?: string;
  evidence?: string;
}

export interface ActorAnalysis {
  /** Ontology coverage analysis */
  capabilities: CapabilityAnalysis;
  /** Security classifications found */
  classifications: ClassificationAnalysis[];
  /** Standards and certifications */
  standards: StandardAnalysis[];
  /** Customer references */
  customerHistory: CustomerHistoryAnalysis[];
  /** Capacity attributes */
  capacityAttributes: CapacityAnalysis[];
  /** AI-generated descriptions */
  descriptions: { type: string; content: string }[];
  /** Overall assessment notes */
  notes?: string;
}

export interface AnalyzedActor {
  /** The session_actors.id */
  selectionId: string;
  /** The actor being analyzed */
  actorId: string;
  /** The role this analysis is for */
  roleId: string;
  /** The deep analysis results */
  analysis: ActorAnalysis;
}

export interface AnalyzedActors {
  actors: AnalyzedActor[];
}
