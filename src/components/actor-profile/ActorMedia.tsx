import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ActorMediaRow {
  id: string;
  type: string;
  url: string;
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

export function ActorLogo({
  name,
  url,
  size = 72,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={`${name} logo`}
        style={{ width: size, height: size }}
        className="rounded-md object-cover bg-elevated border border-border shrink-0"
      />
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

export function ActorHeroBanner({ url, alt }: { url: string; alt: string }) {
  return (
    <div className="relative w-full h-[240px] mb-4 rounded-lg overflow-hidden border border-border">
      <img src={url} alt={alt} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent pointer-events-none" />
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
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenIdx(i)}
            className="group aspect-square overflow-hidden rounded-md border border-border bg-elevated hover:border-border-accent transition-colors"
          >
            <img
              src={m.url}
              alt={`${actorName} product ${i + 1}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </button>
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
