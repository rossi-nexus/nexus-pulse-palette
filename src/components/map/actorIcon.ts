import L from "leaflet";
import type { ActorsMapEntry } from "@/hooks/useActorsMap";

/**
 * Map of common domain ontology categories → marker base colour (hex).
 * Falls back to a neutral grey for unknown / null domains.
 * Colours chosen to be distinguishable against the dark-inverted OSM tiles.
 */
export const DOMAIN_COLOR_MAP: Record<string, string> = {
  "Defence & Military": "#4a7ab5",
  "Maritime & Subsea": "#4fada0",
  "Energy & Critical Infrastructure": "#e8a23a",
  "Aerospace & Space": "#9b72cf",
  "Cybersecurity": "#e85d3a",
  "Emergency Response": "#dc4c4c",
  "Healthcare & Medical": "#4dafa0",
  "Logistics & Transport": "#c9a84c",
  "Telecommunications": "#5ab9d8",
  "Manufacturing": "#a0a8c0",
  "Research & Academia": "#7d9bc4",
  "Public Sector": "#94a3b8",
  "Construction": "#b8956b",
};

export const DOMAIN_FALLBACK_COLOR = "#6b7280";

export function colorForDomain(domain: string | null | undefined): string {
  if (!domain) return DOMAIN_FALLBACK_COLOR;
  return DOMAIN_COLOR_MAP[domain] ?? DOMAIN_FALLBACK_COLOR;
}

const DECAY_WARNING_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export function isDecayWarning(decays_at: string | null): boolean {
  if (!decays_at) return false;
  const t = Date.parse(decays_at);
  if (Number.isNaN(t)) return false;
  return t - Date.now() < DECAY_WARNING_MS && t > Date.now();
}

export function isApproximate(precision: ActorsMapEntry["geocoded_precision"]): boolean {
  return precision === "city" || precision === "country";
}

export function buildActorIcon(actor: ActorsMapEntry): L.DivIcon {
  const baseColor = colorForDomain(actor.primary_domain_category);
  const dashed = isApproximate(actor.geocoded_precision);
  const warning = isDecayWarning(actor.decays_at);
  const initial = (actor.legal_name?.trim()?.[0] ?? "?").toUpperCase();

  const borderStyle = dashed ? "dashed" : "solid";
  const ring = warning
    ? `<span class="actor-marker-decay-ring"></span>`
    : "";

  const html = `
    <div class="actor-marker-icon" style="background:${baseColor};border-style:${borderStyle};">
      <span class="actor-marker-letter">${initial}</span>
      ${ring}
    </div>
  `;

  return L.divIcon({
    html,
    className: "actor-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
