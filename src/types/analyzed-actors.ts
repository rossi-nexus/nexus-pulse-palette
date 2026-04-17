/** A4 — Deep Analysis: enriched analysis of selected actors */

export type AnalysisConfidence = 'high' | 'medium' | 'low';

export type ClassificationLevel =
  | 'top_secret'
  | 'secret'
  | 'confidential'
  | 'restricted'
  | 'industrial_security'
  | 'unclassified'
  | 'unknown';

export type CustomerSegment = 'defense' | 'civil_government' | 'commercial' | 'export';

export type AnalysisSourceType =
  | 'company_website'
  | 'news'
  | 'directory'
  | 'government'
  | 'linkedin'
  | 'annual_report'
  | 'other';

/** A single matched ontology entry with mandatory evidence */
export interface MatchedEntry {
  entryId?: string;
  entryName: string;
  evidence: string;
}

/** A category bucket (capabilities/competences) with its matched entries */
export interface MatchedCategory {
  categoryId?: string;
  categoryName: string;
  entries: MatchedEntry[];
}

export interface MatchedDomain {
  entryId?: string;
  domainName: string;
  evidence: string;
}

export interface MatchedProduct {
  entryId?: string;
  productName: string;
  description?: string;
  evidence: string;
}

export interface MatchedService {
  entryId?: string;
  serviceName: string;
  description?: string;
  evidence: string;
}

export interface ClassificationDetail {
  system: string;
  levelNationalTerm?: string;
  confidence: AnalysisConfidence;
  evidence: string;
}

export interface ClassificationAnalysis {
  levelNormalized: ClassificationLevel;
  details: ClassificationDetail[];
}

export interface StandardAnalysis {
  standardName: string;
  standardNumber?: string;
  evidence: string;
}

export interface CustomerHistoryAnalysis {
  customerName: string;
  description?: string;
  year?: number;
  domain?: string;
  segment?: CustomerSegment;
  evidence: string;
}

export interface AnalysisSource {
  url: string;
  title: string;
  type: AnalysisSourceType;
}

export interface ActorAnalysis {
  capabilities: MatchedCategory[];
  competences: MatchedCategory[];
  domains: MatchedDomain[];
  products: MatchedProduct[];
  services: MatchedService[];
  classification?: ClassificationAnalysis;
  standards?: StandardAnalysis[];
  customerHistory?: CustomerHistoryAnalysis[];
  analysisSources: AnalysisSource[];
}

export interface AnalyzedActor {
  /** session_actors.id from Step 3 */
  selectionId: string;
  /** Actor identifier */
  actorId: string;
  /** Role this analysis is scoped to */
  roleId: string;
  /** Whether the AI ran or it was skipped (e.g., non-commercial reference actor) */
  status: 'analyzed' | 'skipped' | 'error';
  /** The deep analysis results — null when skipped or error */
  analysis: ActorAnalysis | null;
  /** Reason for skip / error message */
  note?: string;
}

export interface AnalyzedActors {
  actors: AnalyzedActor[];
}
