// Phase 6.5.5c — Programme analytics types.

export interface ProgrammeSummary {
  session_count: number;
  member_count: number;
  verified_actor_count: number;
  pending_suggestion_count: number;
  decay_warning_count: number;
}

export interface VerificationActivityEntry {
  event_id: string;
  actor_id: string;
  actor_name: string;
  verifier_name: string | null;
  confidence: "high" | "medium" | "low" | null;
  decays_at: string | null;
  created_at: string;
}

export interface DecayWarningEntry {
  actor_id: string;
  actor_name: string;
  decays_at: string;
  state: "decay_warning" | "expired";
  days_until: number;
}

export interface MemberContribution {
  user_id: string;
  user_name: string | null;
  role: "owner" | "consultant" | "viewer";
  verifications_count: number;
  suggestions_made_count: number;
}

export interface ProgrammeAuditEntry {
  id: string;
  event_type: string;
  target_table: string;
  target_record_id: string | null;
  actor_user_id: string | null;
  actor_user_name: string | null;
  changes_summary: string;
  created_at: string;
}
