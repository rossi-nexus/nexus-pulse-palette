/**
 * DH-01 — Country normalization, display, and canonical list.
 *
 * The single client-side source of truth for country handling.
 * Storage and API values are ISO 3166-1 alpha-2, uppercase ("NO").
 * Display values are localized full names rendered via countryDisplayName().
 *
 * KEEP IN SYNC with:
 *   - supabase/functions/_shared/country.ts (edge runtime)
 *   - public.fn_normalize_country (SQL — see DH-01 migration)
 *
 * When adding a country, add it to all three.
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

/** Canonical display names per ISO (English). */
const ISO_TO_NAME_EN: Record<string, string> = {
  NO: "Norway", SE: "Sweden", FI: "Finland", DK: "Denmark", IS: "Iceland",
  EE: "Estonia", LV: "Latvia", LT: "Lithuania",
  DE: "Germany", FR: "France", IT: "Italy", ES: "Spain", PT: "Portugal",
  NL: "Netherlands", BE: "Belgium", LU: "Luxembourg", IE: "Ireland", AT: "Austria", CH: "Switzerland",
  PL: "Poland", CZ: "Czech Republic", SK: "Slovakia", HU: "Hungary", SI: "Slovenia",
  HR: "Croatia", GR: "Greece", BG: "Bulgaria", RO: "Romania", CY: "Cyprus", MT: "Malta",
  AL: "Albania", ME: "Montenegro", MK: "North Macedonia", TR: "Turkey",
  GB: "United Kingdom", US: "United States", CA: "Canada", AU: "Australia", NZ: "New Zealand",
};

/** Native-language display names (subset). */
const ISO_TO_NAME_NATIVE: Record<string, string> = {
  NO: "Norge", SE: "Sverige", FI: "Suomi", DK: "Danmark", IS: "Ísland",
  DE: "Deutschland", FR: "France", ES: "España", NL: "Nederland",
};

const VALID_ISO = new Set(Object.keys(ISO_TO_NAME_EN));

/**
 * Normalize a free-text country value to ISO 3166-1 alpha-2 (uppercase).
 * Returns null for empty / unrecognised values so callers can distinguish
 * "known country" from "unverified". Use normalizeCountryLoose for the
 * legacy fallback behaviour.
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

/** Legacy fallback: ISO when known, otherwise uppercased raw value. */
export function normalizeCountryLoose(value: string | null | undefined): string | null {
  const iso = normalizeCountry(value);
  if (iso) return iso;
  if (!value) return null;
  const t = value.trim();
  return t ? t.toUpperCase() : null;
}

/**
 * Render an ISO-2 (or already-named) value as a human-readable country name.
 * Pass `locale: "native"` for native-language names where available.
 * Returns "—" for null/empty/unknown.
 */
export function countryDisplayName(
  value: string | null | undefined,
  locale: "en" | "native" = "en",
): string {
  if (!value) return "—";
  const iso = normalizeCountry(value);
  if (!iso) {
    // Unrecognised — show the raw value as a fallback (matches what the DB
    // preserves verbatim) rather than dropping useful info.
    return value.trim() || "—";
  }
  if (locale === "native") {
    return ISO_TO_NAME_NATIVE[iso] ?? ISO_TO_NAME_EN[iso] ?? iso;
  }
  return ISO_TO_NAME_EN[iso] ?? iso;
}

/**
 * Expand ISO-2 codes to include known full-name and native synonyms, for
 * passing to DB queries where the `country` column may still contain
 * non-normalized values during the rollout window. After the trigger is in
 * place this should only ever be one extra alias per code, but the helper
 * is retained for belt-and-braces (SX-04b semantics).
 */
export function expandCountryAliases(isoCodes: string[]): string[] {
  const out = new Set<string>();
  for (const code of isoCodes) {
    const iso = code.toUpperCase();
    out.add(iso);
    const en = ISO_TO_NAME_EN[iso];
    if (en) out.add(en);
    const native = ISO_TO_NAME_NATIVE[iso];
    if (native) out.add(native);
  }
  return Array.from(out);
}

/**
 * Canonical list for country <select> inputs.
 * Ordered: Nordics, Baltics, EU/NATO neighbours, Anglo, then alphabetical for the rest.
 */
export interface CountryOption {
  iso: string;
  name: string;
}

const PRIORITY_ORDER: string[] = [
  "NO", "SE", "FI", "DK", "IS",
  "EE", "LV", "LT",
  "DE", "FR", "NL", "BE", "PL",
  "GB", "US",
];

export const COUNTRY_LIST: CountryOption[] = (() => {
  const all = Object.entries(ISO_TO_NAME_EN).map(([iso, name]) => ({ iso, name }));
  const priority = PRIORITY_ORDER.map((iso) => all.find((o) => o.iso === iso)).filter(
    Boolean,
  ) as CountryOption[];
  const rest = all
    .filter((o) => !PRIORITY_ORDER.includes(o.iso))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...priority, ...rest];
})();
