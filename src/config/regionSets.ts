/**
 * SX-04 — Region sets for sourcing intent expansion.
 *
 * Single source of truth for the country groups used by both the client-side
 * search hook (web post-filter, DB pre-filter expansion) and the server-side
 * ranking RPC. The migration that ships `fn_compute_actor_relevance_score_v2`
 * mirrors these exact lists — keep them in sync when editing.
 *
 * Codes are ISO 3166-1 alpha-2, uppercase.
 */

export const NORDIC = ["NO", "SE", "FI", "DK", "IS"] as const;
export const BALTIC = ["EE", "LV", "LT"] as const;

/** EU member states (2024 snapshot). */
export const EU = [
  "DE","FR","IT","ES","PT","NL","BE","LU","IE","AT",
  "PL","CZ","SK","HU","SI","HR","GR","BG","RO",
  "EE","LV","LT","FI","SE","DK","CY","MT",
] as const;

/** NATO member states (2024 snapshot, includes new accessions NO/SE/FI). */
export const NATO = [
  "NO","SE","FI","DK","IS","DE","FR","GB","US","CA","IT","ES","PT","NL","BE","PL",
  "EE","LV","LT","CZ","SK","HU","GR","TR","BG","RO","SI","HR","LU","AL","ME","MK",
] as const;

export const FIVE_EYES = ["US", "GB", "CA", "AU", "NZ"] as const;

export type SourcingIntent = "local" | "national" | "regional" | "allied" | "unrestricted";

/**
 * Resolve the set of countries that satisfy a given sourcing intent.
 *
 * - national → user-named countries (defaults to ["NO"] if none, with a console warning)
 * - regional → user-named countries ∪ Nordic ∪ Baltic
 * - allied   → NATO ∪ EU
 * - local    → deferred (treat like national; logs a TODO)
 * - unrestricted / undefined → returns null (no hard filter)
 *
 * Returned codes are uppercase, deduplicated.
 */
export function resolveIntentCountries(
  intent: SourcingIntent | undefined | null,
  declaredCountries: string[] | undefined | null,
): string[] | null {
  const named = (declaredCountries ?? []).map((c) => (c ?? "").toUpperCase()).filter(Boolean);
  const dedupe = (arr: readonly string[]) => Array.from(new Set(arr.map((c) => c.toUpperCase())));

  switch (intent) {
    case "national":
      if (named.length === 0) {
        console.warn(
          "[SX-04] sourcing_intent=national with no geography.countries — defaulting to ['NO']. Set countries to override.",
        );
        return ["NO"];
      }
      return dedupe(named);
    case "regional":
      return dedupe([...named, ...NORDIC, ...BALTIC]);
    case "allied":
      return dedupe([...NATO, ...EU]);
    case "local":
      // SX-04 — local needs distance from a reference point; treat as national for now.
      console.warn("[SX-04] sourcing_intent=local — distance-based scoring not yet wired; treating as national.");
      if (named.length === 0) return ["NO"];
      return dedupe(named);
    case "unrestricted":
    case null:
    case undefined:
    default:
      return null;
  }
}

/** Sourcing flavour words to inject into search-role query synthesis. */
export function sourcingFlavour(intent: SourcingIntent | undefined | null, countries: string[]): string | null {
  switch (intent) {
    case "national":
      if (countries.includes("NO") || countries.length === 0) return "Norwegian";
      return countries[0] ? `${countries[0]} domestic` : "domestic";
    case "regional":
      return "Nordic or Baltic";
    case "allied":
      return "NATO or EU member";
    case "local":
      return "local";
    case "unrestricted":
    case null:
    case undefined:
    default:
      return null;
  }
}
