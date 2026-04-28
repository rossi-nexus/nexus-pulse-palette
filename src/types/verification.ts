/**
 * Verification lifecycle (Phase 6.5.3a).
 *
 * `verified_at` / `verifier_id` / `decays_at` / `verifier_confidence` are
 * event-timestamp columns added to the verifiable tables (actors + curated
 * satellites). They are distinct from `verification_status` (the curation
 * stage enum) — see strategic plan §8 + Q5 (b) resolution 2026-04-28.
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
