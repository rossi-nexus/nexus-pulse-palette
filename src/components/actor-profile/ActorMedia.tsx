import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ProvenanceBadge, { type ProvenanceData } from "@/components/actor-profile/ProvenanceBadge";

export interface ActorMediaRow {
  id: string;
  type: string;
  url: string;
  source?: string | null;
  verified_at?: string | null;
  verifier_id?: string | null;
  decays_at?: string | null;
  confidence?: string | null;
  crop_data?: any;
}

const PALETTE = [
  "from-accent-blue/30 to-accent-teal/30",
  "from-accent-teal/30 to-accent-green/30",
  "from-accent-green/30 to-accent-blue/30",
  "from-warning/25 to-accent-teal/30",
  "from-accent-blue/30 to-warning/25",
];

function hashIndex(str: string, n: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

/** Small absolute-positioned provenance badge for the bottom-right of media. */
function MediaProvenanceOverlay({ data }: { data?: ProvenanceData | null }) {
  if (!data) return null;
  return (
    <div className="absolute bottom-1.5 right-1.5 z-10">
      <ProvenanceBadge {...data} size="dot" />
    </div>
  );
}

export function ActorLogo({
  name,
  url,
  size = 72,
  provenance,
}: {
  name: string;
  url?: string | null;
  size?: number;
  provenance?: ProvenanceData | null;
}) {
  if (url) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <img
          src={url}
          alt={`${name} logo`}
          style={{ width: size, height: size }}
          className="rounded-md object-cover bg-elevated border border-border"
        />
        <MediaProvenanceOverlay data={provenance} />
      </div>
    );
  }
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const grad = PALETTE[hashIndex(name, PALETTE.length)];
  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "rounded-md flex items-center justify-center shrink-0 bg-gradient-to-br border border-border",
        grad,
      )}
    >
      <span className="text-2xl font-semibold text-foreground">{initial}</span>
    </div>
  );
}

export function ActorHeroBanner({
  url,
  alt,
  provenance,
}: {
  url: string;
  alt: string;
  provenance?: ProvenanceData | null;
}) {
  return (
    <div className="relative w-full h-[240px] mb-4 rounded-lg overflow-hidden border border-border">
      <img src={url} alt={alt} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent pointer-events-none" />
      <MediaProvenanceOverlay data={provenance} />
    </div>
  );
}

export function ProductGallery({
  images,
  actorName,
}: {
  images: ActorMediaRow[];
  actorName: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  if (images.length === 0) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {images.map((m, i) => (
          <div key={m.id} className="relative">
            <button
              type="button"
              onClick={() => setOpenIdx(i)}
              className="group aspect-square w-full overflow-hidden rounded-md border border-border bg-elevated hover:border-border-accent transition-colors"
            >
              <img
                src={m.url}
                alt={`${actorName} product ${i + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </button>
            <MediaProvenanceOverlay
              data={{
                source: m.source ?? null,
                verified_at: m.verified_at ?? null,
                verifier_id: m.verifier_id ?? null,
                decays_at: m.decays_at ?? null,
              }}
            />
          </div>
        ))}
      </div>
      <Dialog open={openIdx !== null} onOpenChange={(v) => !v && setOpenIdx(null)}>
        <DialogContent className="max-w-3xl bg-elevated border-border p-2">
          {openIdx !== null && (
            <img
              src={images[openIdx].url}
              alt={`${actorName} product ${openIdx + 1}`}
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
