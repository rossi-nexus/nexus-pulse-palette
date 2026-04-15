/** A3 — Search: actor selection results */

export interface ActorIdentity {
  id: string;
  legalName: string;
  tradeNames: string[];
  orgNumber?: string;
  city?: string;
  country?: string;
  websites: string[];
}

export interface SearchGatheredData {
  /** Source of this search result */
  source: 'database' | 'web';
  /** Relevance/match score from the search engine (internal, not shown to user) */
  matchScore?: number;
  /** Brief reason this actor was surfaced */
  matchReason?: string;
  /** Raw data snippets from the search */
  snippets?: string[];
}

export interface SelectedActor {
  /** Internal selection ID (session_actors.id) */
  selectionId: string;
  /** The role this actor is selected for */
  roleId: string;
  /** Actor identity */
  actor: ActorIdentity;
  /** How the actor was found */
  searchData: SearchGatheredData;
  /** Whether included or saved for later */
  status: 'included' | 'saved_for_later';
}

export interface ActorSelection {
  /** All actors surfaced during search, with their selection status */
  actors: SelectedActor[];
  /** Total found before filtering */
  totalFound: number;
  /** Count of included actors */
  includedCount: number;
  /** Count of saved-for-later actors */
  savedCount: number;
}
