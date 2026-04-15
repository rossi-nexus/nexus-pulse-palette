/** A5 — Database Check: results of checking actors against the database */

export interface ExactMatch {
  /** The actor ID in the database */
  actorId: string;
  legalName: string;
  verificationStatus: 'unverified' | 'verified' | 'admin_verified';
  /** Fields that already exist in the database */
  existingFields: string[];
  /** Fields that were found in search but not in DB */
  newFields: string[];
}

export interface SimilarActor {
  /** The actor ID in the database */
  actorId: string;
  legalName: string;
  /** How similar (e.g. name match, org number match) */
  matchType: string;
  /** Similarity description */
  matchDetail: string;
}

export interface DatabaseCheckResult {
  /** The session_actors.id being checked */
  selectionId: string;
  /** The actor being checked */
  actorId: string;
  /** Exact match found in DB */
  exactMatch?: ExactMatch;
  /** Similar actors found in DB */
  similarActors: SimilarActor[];
  /** Whether this actor is new to the database */
  isNew: boolean;
}
