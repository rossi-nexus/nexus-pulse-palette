import type { VerifiedBadgeState } from "@/types/verification";

/** Records within this window of `decays_at` show 'decay_warning'. */
export const DECAY_WARNING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Maps verification timestamps to one of four UI states. Pure; `now`
 * injectable for tests.
 *
 *  - unverified      → no verified_at (never verified, or re-verification pending)
 *  - verified_fresh  → verified_at set, decays_at null (no expiry) OR decays_at > now+30d
 *  - decay_warning   → decays_at within 30 days
 *  - expired         → decays_at <= now
 */
export function computeVerifiedBadgeState(
  verifiedAt: string | null | undefined,
  decaysAt: string | null | undefined,
  now: Date = new Date(),
): VerifiedBadgeState {
  if (!verifiedAt) return "unverified";
  if (!decaysAt) return "verified_fresh";

  const decay = new Date(decaysAt).getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(decay)) return "verified_fresh";

  if (decay <= nowMs) return "expired";
  if (decay - nowMs <= DECAY_WARNING_WINDOW_MS) return "decay_warning";
  return "verified_fresh";
}
