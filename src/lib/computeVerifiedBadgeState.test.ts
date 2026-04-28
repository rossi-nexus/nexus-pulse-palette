import { describe, it, expect } from "vitest";
import { computeVerifiedBadgeState } from "./computeVerifiedBadgeState";

const NOW = new Date("2026-04-28T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

describe("computeVerifiedBadgeState", () => {
  it("returns 'unverified' when verified_at is null", () => {
    expect(computeVerifiedBadgeState(null, null, NOW)).toBe("unverified");
    expect(computeVerifiedBadgeState(undefined, days(60), NOW)).toBe("unverified");
  });

  it("returns 'verified_fresh' when verified but no decay scheduled", () => {
    expect(computeVerifiedBadgeState(days(-30), null, NOW)).toBe("verified_fresh");
  });

  it("returns 'verified_fresh' when decay is far in the future", () => {
    expect(computeVerifiedBadgeState(days(-30), days(90), NOW)).toBe("verified_fresh");
  });

  it("returns 'decay_warning' when decay is within 30 days", () => {
    expect(computeVerifiedBadgeState(days(-30), days(15), NOW)).toBe("decay_warning");
    expect(computeVerifiedBadgeState(days(-30), days(1), NOW)).toBe("decay_warning");
  });

  it("returns 'expired' when decay has passed", () => {
    expect(computeVerifiedBadgeState(days(-100), days(-1), NOW)).toBe("expired");
    expect(computeVerifiedBadgeState(days(-100), days(0), NOW)).toBe("expired");
  });

  it("treats malformed decay date as no-decay (verified_fresh)", () => {
    expect(computeVerifiedBadgeState(days(-30), "not-a-date", NOW)).toBe("verified_fresh");
  });
});
