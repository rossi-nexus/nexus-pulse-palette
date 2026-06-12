/**
 * Normalize free-text country values to ISO 3166-1 alpha-2 codes.
 *
 * SX-04b: extended to cover the full NATO/EU/Nordic/Baltic vocabulary used by
 * `src/config/regionSets.ts`, with native-language synonyms (Norge, Sverige,
 * Suomi, Danmark, Deutschland, …). Case-insensitive; trims whitespace.
 *
 * Returns:
 *   - ISO-2 code (uppercase) when the value is a known country name or already
 *     an ISO-2 code.
 *   - `null` for empty / unrecognised values (caller must treat unknowns as
 *     "country unverified", not "excluded"; see useSearch.ts).
 */

const NAME_TO_ISO: Record<string, string> = {
  // Nordics
  norway: "NO", norge: "NO", noreg: "NO",
  sweden: "SE", sverige: "SE",
  finland: "FI", suomi: "FI",
  denmark: "DK", danmark: "DK",
  iceland: "IS", island: "IS",
  // Baltics
  estonia: "EE", eesti: "EE",
  latvia: "LV", latvija: "LV",
  lithuania: "LT", lietuva: "LT",
  // Western & Central Europe
  germany: "DE", deutschland: "DE",
  france: "FR",
  italy: "IT", italia: "IT",
  spain: "ES", españa: "ES", espana: "ES",
  portugal: "PT",
  netherlands: "NL", holland: "NL", nederland: "NL",
  belgium: "BE", belgie: "BE", belgië: "BE",
  luxembourg: "LU",
  ireland: "IE", éire: "IE", eire: "IE",
  austria: "AT", österreich: "AT", osterreich: "AT",
  switzerland: "CH", schweiz: "CH", suisse: "CH",
  // CEE & SEE
  poland: "PL", polska: "PL",
  "czech republic": "CZ", czechia: "CZ", česko: "CZ", cesko: "CZ",
  slovakia: "SK", slovensko: "SK",
  hungary: "HU", magyarország: "HU", magyarorszag: "HU",
  slovenia: "SI", slovenija: "SI",
  croatia: "HR", hrvatska: "HR",
  greece: "GR", ελλάδα: "GR", ellada: "GR",
  bulgaria: "BG",
  romania: "RO",
  cyprus: "CY",
  malta: "MT",
  albania: "AL", shqipëria: "AL", shqiperia: "AL",
  montenegro: "ME", "crna gora": "ME",
  "north macedonia": "MK", macedonia: "MK",
  turkey: "TR", türkiye: "TR", turkiye: "TR",
  // Anglo
  "united kingdom": "GB", uk: "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB",
  "united states": "US", usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US",
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
};

const VALID_ISO = new Set([
  "NO","SE","FI","DK","IS","EE","LV","LT","DE","FR","IT","ES","PT","NL","BE","LU","IE","AT","CH",
  "PL","CZ","SK","HU","SI","HR","GR","BG","RO","CY","MT","AL","ME","MK","TR",
  "GB","US","CA","AU","NZ",
]);

/**
 * @returns ISO-2 code (uppercase) when recognised; otherwise null.
 *
 * NOTE: unlike the previous implementation, unknown values return `null` so
 * callers can distinguish "known foreign country" from "unverified". Use
 * `normalizeCountryLoose` if you need the old uppercase-fallback behaviour
 * (e.g. for the map filter grouping).
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && VALID_ISO.has(upper)) return upper;
  const key = trimmed.toLowerCase();
  return NAME_TO_ISO[key] ?? null;
}

/** Legacy behaviour: returns ISO when known, otherwise the uppercased raw value. */
export function normalizeCountryLoose(value: string | null | undefined): string | null {
  const iso = normalizeCountry(value);
  if (iso) return iso;
  if (!value) return null;
  const t = value.trim();
  return t ? t.toUpperCase() : null;
}

/**
 * Expand a set of ISO-2 codes to include known full-name and native synonyms,
 * for passing to DB queries that compare against `actors.country` values which
 * may be stored either as ISO ("NO") or as names ("Norway"). Returns an
 * uppercased + name-cased deduped array.
 */
export function expandCountryAliases(isoCodes: string[]): string[] {
  const out = new Set<string>();
  for (const code of isoCodes) {
    const iso = code.toUpperCase();
    out.add(iso);
  }
  for (const [name, iso] of Object.entries(NAME_TO_ISO)) {
    if (out.has(iso)) {
      // add Title Case variant
      out.add(name.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  return Array.from(out);
}
