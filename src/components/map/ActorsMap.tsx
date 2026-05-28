import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import L, { LatLngBoundsExpression } from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip as LeafletTooltip,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Maximize2, ChevronDown, ChevronUp } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/lib/assets/MarkerCluster.css";
import "react-leaflet-cluster/lib/assets/MarkerCluster.Default.css";

import type { ActorsMapEntry } from "@/hooks/useActorsMap";
import { buildActorIcon, colorForDomain, isDecayWarning } from "@/components/map/actorIcon";
import { normalizeCountry } from "@/lib/normalizeCountry";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VerifiedStatusBadge from "@/components/nexus/VerifiedStatusBadge";

const DEFAULT_CENTER: [number, number] = [61.0, 6.0];
const DEFAULT_ZOOM = 6;

const PRECISION_LABEL: Record<string, string> = {
  street: "Street-level",
  postal: "Postal-area",
  city: "Approximate — town",
  country: "Approximate — country",
};

function hasCoords(a: ActorsMapEntry): a is ActorsMapEntry & { latitude: number; longitude: number } {
  return a.latitude != null && a.longitude != null;
}

// ── Internal map effect components (must live inside <MapContainer>) ──

function ViewPersistence({ storageKey }: { storageKey: string }) {
  const map = useMap();
  useEffect(() => {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      try {
        const v = JSON.parse(raw) as { center: [number, number]; zoom: number };
        if (v?.center && typeof v.zoom === "number") {
          map.setView(v.center, v.zoom, { animate: false });
        }
      } catch {
        /* ignore */
      }
    }
    const onMove = () => {
      const c = map.getCenter();
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }),
      );
    };
    map.on("moveend", onMove);
    return () => {
      map.off("moveend", onMove);
    };
  }, [map, storageKey]);
  return null;
}

function FitOnFirstLoad({ actors, storageKey }: { actors: ActorsMapEntry[]; storageKey: string }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current) return;
    if (sessionStorage.getItem(storageKey)) {
      fittedRef.current = true;
      return;
    }
    const coords = actors.filter(hasCoords).map((a) => [a.latitude, a.longitude] as [number, number]);
    if (coords.length === 0) return;
    fittedRef.current = true;
    const bounds: LatLngBoundsExpression = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [actors, map, storageKey]);
  return null;
}

function ResizeWatcher({ targetRef }: { targetRef: React.RefObject<HTMLDivElement> }) {
  const map = useMap();
  useEffect(() => {
    if (!targetRef.current) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(targetRef.current);
    return () => ro.disconnect();
  }, [map, targetRef]);
  return null;
}

function ResetViewButton() {
  const map = useMap();
  return (
    <button
      onClick={() => map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 })}
      className="absolute top-[10px] left-[60px] z-[400] bg-elevated/95 border border-border rounded-md p-2 hover:bg-surface transition-colors shadow"
      title="Reset view"
    >
      <Maximize2 className="w-4 h-4 text-foreground" />
    </button>
  );
}

// ── Public component ──

export interface ActorsMapProps {
  /** Full dataset (geocoded + not). Counters use both. */
  actors: ActorsMapEntry[];
  /** sessionStorage key for persisted view (lets pipeline + collection + DB use separate views). */
  viewStorageKey: string;
  /** Optional class for the outer wrapper. */
  className?: string;
  /** Show sidebar filters (sector / verification / country). Default true. */
  showFilters?: boolean;
  /** When true, the "View profile" link in the popup is omitted. */
  hideProfileLink?: boolean;
}

export function ActorsMap({
  actors,
  viewStorageKey,
  className,
  showFilters = true,
  hideProfileLink = false,
}: ActorsMapProps) {
  const navigate = useNavigate();
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const [showUngeocodedDialog, setShowUngeocodedDialog] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [selectedVerification, setSelectedVerification] = useState<Set<string>>(new Set());
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());

  const allDomains = useMemo(() => {
    const s = new Set<string>();
    for (const a of actors) if (a.primary_domain_category) s.add(a.primary_domain_category);
    return Array.from(s).sort();
  }, [actors]);

  const allCountries = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of actors) {
      const iso = normalizeCountry(a.country);
      if (iso) {
        if (!m.has(iso)) m.set(iso, a.country?.trim() || iso);
      }
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [actors]);

  const filtered = useMemo(() => {
    return actors.filter((a) => {
      if (selectedDomains.size > 0) {
        if (!a.primary_domain_category || !selectedDomains.has(a.primary_domain_category)) return false;
      }
      if (selectedVerification.size > 0) {
        const states: string[] = [];
        if (a.verification_status === "verified" || a.verification_status === "admin_verified") {
          states.push("verified");
        } else {
          states.push("unverified");
        }
        if (isDecayWarning(a.decays_at)) states.push("decay-warning");
        const ok = states.some((s) => selectedVerification.has(s));
        if (!ok) return false;
      }
      if (selectedCountries.size > 0) {
        const iso = normalizeCountry(a.country);
        if (!iso || !selectedCountries.has(iso)) return false;
      }
      return true;
    });
  }, [actors, selectedDomains, selectedVerification, selectedCountries]);

  const geocoded = filtered.filter(hasCoords);
  const ungeocodedAll: ActorsMapEntry[] = actors.filter((a) => a.latitude == null || a.longitude == null);
  const totalPlotted = actors.filter(hasCoords).length;

  const legendData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of geocoded) {
      const key = a.primary_domain_category ?? "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [geocoded]);

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className ?? ""}`}>
      {/* Counter line */}
      <div className="px-1 pb-2 text-body-sm text-foreground-secondary shrink-0">
        {totalPlotted} of {actors.length} plotted
        {ungeocodedAll.length > 0 && (
          <>
            {" · "}
            <button
              onClick={() => setShowUngeocodedDialog(true)}
              className="text-accent-teal hover:underline"
            >
              {ungeocodedAll.length} not yet geocoded → view list
            </button>
          </>
        )}
      </div>

      <div className="flex-1 flex min-h-0 border border-border rounded-md overflow-hidden">
        {showFilters && (
          <aside className="w-56 border-r border-border bg-elevated/30 overflow-y-auto shrink-0">
            <div className="p-3 space-y-5">
              <FilterGroup
                title="Sector (domain)"
                options={allDomains}
                selected={selectedDomains}
                onToggle={(k) => toggleSet(selectedDomains, setSelectedDomains, k)}
                onClear={() => setSelectedDomains(new Set())}
                emptyHint="No domain tags yet"
              />
              <FilterGroup
                title="Verification"
                options={["verified", "unverified", "decay-warning"]}
                selected={selectedVerification}
                onToggle={(k) => toggleSet(selectedVerification, setSelectedVerification, k)}
                onClear={() => setSelectedVerification(new Set())}
                labelFor={(k) =>
                  k === "decay-warning" ? "Decay warning (≤60d)" : k.charAt(0).toUpperCase() + k.slice(1)
                }
              />
              <FilterGroup
                title="Country"
                options={allCountries.map(([iso]) => iso)}
                labelFor={(iso) => allCountries.find(([k]) => k === iso)?.[1] ?? iso}
                selected={selectedCountries}
                onToggle={(k) => toggleSet(selectedCountries, setSelectedCountries, k)}
                onClear={() => setSelectedCountries(new Set())}
              />
            </div>
          </aside>
        )}

        <div ref={mapBoxRef} className="flex-1 relative min-w-0">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="w-full h-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              className="dark-map-tiles"
            />

            <ViewPersistence storageKey={viewStorageKey} />
            <FitOnFirstLoad actors={geocoded} storageKey={viewStorageKey} />
            <ResizeWatcher targetRef={mapBoxRef} />
            <ResetViewButton />

            <MarkerClusterGroup chunkedLoading>
              {geocoded.map((actor) => (
                <Marker
                  key={actor.id}
                  position={[actor.latitude!, actor.longitude!]}
                  icon={buildActorIcon(actor)}
                >
                  <LeafletTooltip direction="top" offset={[0, -14]} opacity={0.95}>
                    {actor.legal_name}
                  </LeafletTooltip>
                  <Popup autoClose={false} closeOnClick={false} closeOnEscapeKey>
                    <ActorPopupCard
                      actor={actor}
                      onNavigate={hideProfileLink ? undefined : (id) => navigate(`/actors/${id}`)}
                    />
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>

          <div className="absolute bottom-3 left-3 z-[400] bg-elevated/95 border border-border rounded-md shadow text-xs max-w-[260px]">
            <button
              onClick={() => setLegendOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-foreground"
            >
              <span className="font-medium">Legend ({legendData.length})</span>
              {legendOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            {legendOpen && (
              <div className="border-t border-border px-3 py-2 max-h-56 overflow-y-auto space-y-1">
                {legendData.length === 0 && (
                  <div className="text-foreground-muted italic">No markers visible</div>
                )}
                {legendData.map(([domain, count]) => (
                  <div key={domain} className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-foreground/30"
                      style={{ background: colorForDomain(domain === "Unknown" ? null : domain) }}
                    />
                    <span className="flex-1 truncate text-foreground-secondary">{domain}</span>
                    <span className="text-foreground-muted">{count}</span>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-border text-foreground-muted">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-foreground-muted/40 border-2 border-solid border-foreground" />
                    Street/postal precision
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-foreground-muted/40 border-2 border-dashed border-foreground" />
                    City/country precision
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showUngeocodedDialog} onOpenChange={setShowUngeocodedDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col z-[1100]">
          <DialogHeader>
            <DialogTitle>Actors not yet geocoded ({ungeocodedAll.length})</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-6 px-6 divide-y divide-border">
            {ungeocodedAll.length === 0 ? (
              <div className="py-8 text-center text-foreground-muted text-body-sm">
                All actors are geocoded.
              </div>
            ) : (
              ungeocodedAll.map((a) => {
                const status =
                  a.geocoded_precision === "failed"
                    ? "Geocoding failed"
                    : a.geocoded_precision == null && !a.country && !a.city
                      ? "Missing address"
                      : a.geocoded_precision == null
                        ? "Not yet processed"
                        : "Unknown";
                return (
                  <div key={a.id} className="py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{a.legal_name}</div>
                      <div className="text-body-sm text-foreground-secondary truncate">
                        {a.country?.trim() || <span className="italic text-foreground-muted">no country</span>}
                        {" · "}
                        {a.city?.trim() || <span className="italic text-foreground-muted">no city</span>}
                        {" · "}
                        <span className="text-foreground-muted">{status}</span>
                      </div>
                    </div>
                    {!hideProfileLink && (
                      <Link
                        to={`/actors/${a.id}`}
                        onClick={() => setShowUngeocodedDialog(false)}
                        className="text-xs text-accent-teal hover:underline shrink-0"
                      >
                        View profile →
                      </Link>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  onClear,
  labelFor,
  emptyHint,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  labelFor?: (key: string) => string;
  emptyHint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-secondary">
          {title}
        </h3>
        {selected.size > 0 && (
          <button onClick={onClear} className="text-[10px] text-foreground-muted hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      {options.length === 0 ? (
        <div className="text-xs italic text-foreground-muted">{emptyHint ?? "None"}</div>
      ) : (
        <div className="space-y-1.5">
          {options.map((k) => (
            <label
              key={k}
              className="flex items-center gap-2 text-xs text-foreground-secondary hover:text-foreground cursor-pointer"
            >
              <Checkbox
                checked={selected.has(k)}
                onCheckedChange={() => onToggle(k)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{labelFor ? labelFor(k) : k}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ActorPopupCard({
  actor,
  onNavigate,
}: {
  actor: ActorsMapEntry;
  onNavigate?: (id: string) => void;
}) {
  const precisionLabel = actor.geocoded_precision
    ? PRECISION_LABEL[actor.geocoded_precision] ?? actor.geocoded_precision
    : null;
  return (
    <div className="min-w-[220px] text-foreground">
      <div className="font-semibold text-sm mb-1">{actor.legal_name}</div>
      <div className="mb-2">
        <VerifiedStatusBadge verifiedAt={actor.verified_at} decaysAt={actor.decays_at} size="sm" />
      </div>
      {actor.primary_domain_name && (
        <div className="text-xs mb-1">
          <span className="text-foreground-muted">Domain:</span>{" "}
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px]"
            style={{ background: colorForDomain(actor.primary_domain_category) + "33" }}
          >
            {actor.primary_domain_name}
          </span>
        </div>
      )}
      {(actor.city || actor.country) && (
        <div className="text-xs text-foreground-secondary mb-1">
          {[actor.city, actor.country].filter(Boolean).join(" · ")}
        </div>
      )}
      {precisionLabel && (
        <div className="text-[10px] text-foreground-muted mb-2">{precisionLabel}</div>
      )}
      {onNavigate && (
        <button
          onClick={() => onNavigate(actor.id)}
          className="text-xs text-accent-teal hover:underline"
        >
          View profile →
        </button>
      )}
    </div>
  );
}
