export type RegistryId = "brreg" | "cvr" | "prh";

export interface RegistryInfo {
  id: RegistryId;
  name: string;
  country_codes: string[];
  description: string;
  /** Number of digits expected for an org number in this registry */
  orgNumberDigits: number;
  /** Hint shown next to org number input */
  orgNumberHint: string;
  /** Placeholder shown in org number input */
  orgNumberPlaceholder: string;
  /** Optional regex for validating org numbers — overrides digit-count check when present */
  orgNumberPattern?: RegExp;
}

export const REGISTRIES: RegistryInfo[] = [
  {
    id: "brreg",
    name: "BRREG (Norway)",
    country_codes: ["no", "norway", "norge"],
    description: "Brønnøysundregistrene — Norwegian company registry",
    orgNumberDigits: 9,
    orgNumberHint: "Norwegian org numbers are 9 digits",
    orgNumberPlaceholder: "123 456 789",
    orgNumberPattern: /^\d{9}$/,
  },
  {
    id: "cvr",
    name: "CVR (Denmark)",
    country_codes: ["dk", "denmark", "danmark"],
    description: "Det Centrale Virksomhedsregister — Danish company registry",
    orgNumberDigits: 8,
    orgNumberHint: "Danish CVR numbers are 8 digits",
    orgNumberPlaceholder: "12 34 56 78",
    orgNumberPattern: /^\d{8}$/,
  },
  {
    id: "prh",
    name: "PRH (Finland)",
    country_codes: ["fi", "finland", "suomi"],
    description:
      "Patentti- ja rekisterihallitus / YTJ — Finnish Business Information System",
    orgNumberDigits: 8,
    orgNumberHint:
      "Finnish Business ID (Y-tunnus): 7 digits + check digit, e.g. 1234567-8",
    orgNumberPlaceholder: "1234567-8",
    orgNumberPattern: /^\d{7}-?\d$/,
  },
];

export function getRegistryById(id: RegistryId | string | null | undefined): RegistryInfo | null {
  if (!id) return null;
  return REGISTRIES.find((r) => r.id === id) ?? null;
}

export function getRegistryByCountry(country: string | null | undefined): RegistryInfo | null {
  if (!country) return null;
  const c = country.toLowerCase().trim();
  if (!c) return null;
  return REGISTRIES.find((r) => r.country_codes.includes(c)) ?? null;
}
