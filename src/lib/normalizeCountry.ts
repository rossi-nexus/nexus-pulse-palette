/**
 * Normalize free-text country values from `actors.country` to ISO-2.
 * Used by the map filter UI for grouping. Falls back to the raw value
 * (uppercased) so unknown countries still group consistently.
 */
const MAP: Record<string, string> = {
  norway: "NO",
  norge: "NO",
  no: "NO",
  denmark: "DK",
  danmark: "DK",
  dk: "DK",
  sweden: "SE",
  sverige: "SE",
  se: "SE",
  finland: "FI",
  fi: "FI",
  germany: "DE",
  deutschland: "DE",
  de: "DE",
};

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return MAP[key] ?? value.trim().toUpperCase();
}
