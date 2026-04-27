/** Full actor profile — used when viewing/editing actor detail */

export interface ActorContact {
  id: string;
  actorId: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
}

export interface ActorOntologyTag {
  id: string;
  actorId: string;
  ontologyEntryId: string;
  source: 'search' | 'manual' | 'api_connector';
  createdAt: string;
}

export interface ActorCapacityAttribute {
  id: string;
  actorId: string;
  actorOntologyTagId: string;
  attributeType: 'volume' | 'fleet_size' | 'team_size' | 'mobilization_time' | 'coverage' | 'specification';
  valueText: string;
  valueMin?: number;
  valueMax?: number;
  unit?: string;
  evidence?: string;
  createdAt: string;
}

export interface ActorClassification {
  id: string;
  actorId: string;
  classificationSystem: string;
  levelNormalized: 'top_secret' | 'secret' | 'confidential' | 'restricted' | 'industrial_security' | 'unclassified' | 'unknown';
  levelNationalTerm?: string;
  issuingAuthority?: string;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string;
  validFrom?: string;
  validTo?: string;
  createdAt: string;
}

export interface ActorStandard {
  id: string;
  actorId: string;
  standardName: string;
  standardNumber?: string;
  scope?: string;
  certifyingBody?: string;
  validFrom?: string;
  validTo?: string;
  evidence?: string;
  createdAt: string;
}

export interface ActorCustomerHistory {
  id: string;
  actorId: string;
  customerName: string;
  description?: string;
  year?: number;
  domain?: string;
  customerSegment?: 'defense' | 'civil_government' | 'commercial' | 'export';
  branchDetail?: string;
  isReference: boolean;
  createdAt: string;
}

export interface ActorDescription {
  id: string;
  actorId: string;
  type: 'summary' | 'capability' | 'product' | 'service';
  content: string;
  source: 'ai' | 'manual';
  createdAt: string;
}

export interface ActorMedia {
  id: string;
  actorId: string;
  type: 'logo' | 'hero' | 'product';
  url: string;
  linkedOntologyEntryId?: string;
  createdAt: string;
}

export interface ActorProfile {
  id: string;
  legalName: string;
  tradeNames: string[];
  orgNumber?: string;
  streetAddress?: string;
  city?: string;
  region?: string;
  country?: string;
  coordinates?: { x: number; y: number };
  websites: string[];
  source: 'search' | 'manual' | 'url_import' | 'file_import' | 'batch_import' | 'api_connector';
  verificationStatus: 'unverified' | 'verified' | 'admin_verified';
  dataCompleteness: string[];
  createdAt: string;
  updatedAt: string;
  contacts?: ActorContact[];
  ontologyTags?: ActorOntologyTag[];
  capacityAttributes?: ActorCapacityAttribute[];
  classifications?: ActorClassification[];
  standards?: ActorStandard[];
  customerHistory?: ActorCustomerHistory[];
  descriptions?: ActorDescription[];
  media?: ActorMedia[];
}
