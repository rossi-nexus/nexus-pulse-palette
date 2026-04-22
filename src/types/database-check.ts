/** A5 — Database Check: results of checking actors against the main actor database */

export interface ExactMatch {
  /** session_actors.id (or session-scoped actor id) being matched */
  session_actor_id: string;
  /** Main DB actor id */
  db_actor_id: string;
  /** Main DB legal name */
  db_actor_name: string;
  verification_status: "unverified" | "verified" | "admin_verified";
  /** ISO timestamp */
  last_updated: string;
  /** data_completeness fields populated for the matched DB actor */
  profile_completeness: string[];
}

export interface SimilarActor {
  db_actor_id: string;
  actor_name: string;
  /** Human-readable explanation of the similarity, e.g. "Shares 3 matching tags: Radar Systems, Maritime…" */
  similarity_basis: string;
  capacity_summary?: string;
  classification_summary?: string;
  /** Local UI state — what the user chose to do with this suggestion */
  user_action?: "included" | "saved_for_later" | null;
}

export interface DatabaseCheckSummary {
  total_checked: number;
  exact_matches: number;
  not_in_database: number;
  similar_found: number;
}

export interface DatabaseCheckResult {
  phase1_matches: ExactMatch[];
  /** Names of analyzed actors not found in the main DB */
  phase1_not_in_db: string[];
  phase2_suggestions: SimilarActor[];
  summary: DatabaseCheckSummary;
}
