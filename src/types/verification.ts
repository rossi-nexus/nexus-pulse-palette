/**
 * Verification lifecycle (Phase 6.5.3a + 6.5.5b).
 *
 * `verified_at` / `verifier_id` / `decays_at` / `verifier_confidence` are
 * event-timestamp columns added to the verifiable tables (actors + curated
 * satellites). They are distinct from `verification_status` (the curation
 * stage enum) — see strategic plan §8 + Q5 (b) resolution 2026-04-28.
 *
 * Phase 6.5.5b (Q3 b) adds the parallel `verification_events` append-only
 * table. Each verification cycle is one row; the actors columns hold the
 * denormalised "current state" of the latest event.
 *
 * The four-state badge (`VerifiedBadgeState`) is computed UI-side from
 * `verified_at` + `decays_at` + now() via `computeVerifiedBadgeState`.
 * The DB-level `verification_status` enum is independent and read by RLS
 * (the T3 ABAC policy still keys off `verification_status='admin_verified'`).
 */

export type VerifierConfidence = "high" | "medium" | "low";

export type VerifiedBadgeState =
  | "unverified"
  | "verified_fresh"
  | "decay_warning"
  | "expired";

export interface VerificationLifecycle {
  verified_at: string | null;
  verifier_id: string | null;
  decays_at: string | null;
  verifier_confidence: VerifierConfidence | null;
}

// Phase 6.5.5b — verification_events shape.
export type VerificationEventStatus = "in_progress" | "complete" | "rejected";

export interface VerificationEvidenceItem {
  source_url?: string;
  note?: string;
}

export interface VerificationEvent {
  id: string;
  actor_id: string;
  verifier_id: string | null;
  programme_id: string | null;
  source_queue_id: string | null;
  verification_status: VerificationEventStatus;
  evidence: VerificationEvidenceItem[];
  decays_at: string | null;
  verifier_confidence: VerifierConfidence | null;
  verifier_notes: string | null;
  created_at: string;
  completed_at: string | null;
}
