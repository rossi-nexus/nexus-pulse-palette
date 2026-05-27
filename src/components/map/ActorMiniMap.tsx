/**
 * Profile-1: Single-marker mini-map for the actor profile Identity section.
 *
 * Reuses the same Leaflet stack as `ActorsMapPage` (D2b). Renders a small
 * fixed-height map centred on the supplied coordinates with a single
 * teardrop marker, plus a precision badge. When latitude is null, renders a
 * compact muted state describing what's missing and how to retry.
 */

import { Link } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type GeocodedPrecision =
  | "street"
  | "postal"
  | "city"
  | "country"
  | "failed"
  | null
  | undefined;

interface ActorMiniMapProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  precision: GeocodedPrecision;
  /** Path that the CTA targets when onAddAddress is not provided. */
  retryHref: string;
  /** Profile-Part2/P1.4: when provided, the CTA becomes a button that opens edit mode. */
  onAddAddress?: () => void;
}

const PRECISION_LABEL: Record<string, string> = {
  street: "Street-level position",
  postal: "Postal-area position",
  city: "Approximate — town",
  country: "Approximate — country",
};

const PRECISION_BADGE_CLASS: Record<string, string> = {
  street: "bg-success/15 text-success border-success/30",
  postal: "bg-info/15 text-info border-info/30",
  city: "bg-info/15 text-info border-info/30",
  country: "bg-warning/15 text-warning border-warning/30",
};

const markerIcon = L.divIcon({
  html: `<div class="actor-marker-icon" style="background:#4fada0;border-style:solid;"><span class="actor-marker-letter">•</span></div>`,
  className: "actor-marker",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function ActorMiniMap({
  latitude,
  longitude,
  precision,
  retryHref,
  onAddAddress,
}: ActorMiniMapProps) {
  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude);

  if (!hasCoords) {
    const failed = precision === "failed";
    const ctaLabel = failed ? "Edit address" : "Add address";
    const cta = onAddAddress ? (
      <button
        type="button"
        onClick={onAddAddress}
        className="text-accent-teal hover:underline"
      >
        {ctaLabel}
      </button>
    ) : retryHref && retryHref !== "#" ? (
      <Link to={retryHref} className="text-accent-teal hover:underline">
        {ctaLabel}
      </Link>
    ) : null;
    return (
      <div className="bg-surface border border-border/60 rounded-md p-3 text-xs text-foreground-muted">
        {failed ? (
          <>Geocoding failed — add address fields to retry. {cta}</>
        ) : (
          <>Not yet geocoded. {cta}</>
        )}
      </div>
    );
  }

  const label =
    (precision && PRECISION_LABEL[precision]) ?? "Position available";
  const badgeClass =
    (precision && PRECISION_BADGE_CLASS[precision]) ??
    "bg-info/15 text-info border-info/30";

  return (
    <div className="space-y-2">
      <Badge
        variant="outline"
        className={cn("text-[10px] uppercase tracking-wider", badgeClass)}
      >
        {label}
      </Badge>
      <div className="rounded-md overflow-hidden border border-border/60">
        <MapContainer
          center={[latitude as number, longitude as number]}
          zoom={precision === "country" ? 5 : precision === "city" ? 10 : 14}
          style={{ height: 200, width: "100%" }}
          scrollWheelZoom={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            className="dark-map-tiles"
          />
          <Marker
            position={[latitude as number, longitude as number]}
            icon={markerIcon}
          />
        </MapContainer>
      </div>
    </div>
  );
}
