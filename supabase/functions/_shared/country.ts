/**
 * DH-01 — Country normalization for the edge runtime.
 *
 * KEEP IN SYNC with:
 *   - src/lib/normalizeCountry.ts (client)
 *   - public.fn_normalize_country (SQL — see DH-01 migration)
 *
 * When adding a country, add it to all three.
 */

const NAME_TO_ISO: Record<string, string> = {
  norway: "NO", norge: "NO", noreg: "NO",
  sweden: "SE", sverige: "SE",
  finland: "FI", suomi: "FI",
  denmark: "DK", danmark: "DK",
  iceland: "IS", island: "IS",
  estonia: "EE", eesti: "EE",
  latvia: "LV", latvija: "LV",
  lithuania: "LT", lietuva: "LT",
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
  poland: "PL", polska: "PL",
  "czech republic": "CZ", czechia: "CZ", česko: "CZ", cesko: "CZ",
  slovakia: "SK", slovensko: "SK",
  hungary: "HU", magyarország: "HU", magyarorszag: "HU",
  slovenia: "SI", slovenija: "SI",
  croatia: "HR", hrvatska: "HR",
  greece: "GR", ellada: "GR",
  bulgaria: "BG",
  romania: "RO",
  cyprus: "CY",
  malta: "MT",
  albania: "AL", shqipëria: "AL", shqiperia: "AL",
  montenegro: "ME", "crna gora": "ME",
  "north macedonia": "MK", macedonia: "MK",
  turkey: "TR", türkiye: "TR", turkiye: "TR",
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

/** Normalize to ISO 3166-1 alpha-2 uppercase. Returns null on unknown/empty. */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && VALID_ISO.has(upper)) return upper;
  return NAME_TO_ISO[trimmed.toLowerCase()] ?? null;
}

export const COUNTRY_LIST: { iso: string; name: string }[] = [
  { iso: "NO", name: "Norway" }, { iso: "SE", name: "Sweden" }, { iso: "FI", name: "Finland" },
  { iso: "DK", name: "Denmark" }, { iso: "IS", name: "Iceland" },
  { iso: "EE", name: "Estonia" }, { iso: "LV", name: "Latvia" }, { iso: "LT", name: "Lithuania" },
  { iso: "DE", name: "Germany" }, { iso: "FR", name: "France" }, { iso: "NL", name: "Netherlands" },
  { iso: "BE", name: "Belgium" }, { iso: "PL", name: "Poland" },
  { iso: "GB", name: "United Kingdom" }, { iso: "US", name: "United States" },
];
