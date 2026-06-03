/**
 * Rich product cards rendered on the DB-side actor profile.
 *
 * Each card: image (if available), product name, description (from
 * actor_descriptions where type='product' or matching tag evidence),
 * confidence badge, and source link.
 *
 * Cards without supporting data fall back to a bare chip-style card so we
 * never show empty cards.
 */
import { useMemo, useState } from "react";
import { ExternalLink, Info, ImagePlus, Replace } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProductTag {
  entry_name: string;
  evidence?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  source_url?: string | null;
}

export interface ProductDescriptionRow {
  type: string;
  content: string;
}

export interface ProductMediaRow {
  id: string;
  type: string;
  url: string;
  crop_data?: { linked_product_name?: string | null } | null;
}

interface Props {
  products: ProductTag[];
  descriptions: ProductDescriptionRow[];
  media: ProductMediaRow[];
  actorName: string;
  /** V3 batch #3 Area 2 — when true, show per-card add/replace image buttons. */
  editable?: boolean;
  onAddImage?: (productName: string) => void;
  onReplaceImage?: (productName: string, mediaId: string) => void;
}

function hostnameOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function pickDescription(name: string, descs: ProductDescriptionRow[]): string | null {
  const lc = name.trim().toLowerCase();
  // Prefer rows of type=product whose content mentions the product name.
  const product = descs.filter((d) => d.type === "product");
  const match = product.find((d) => d.content.toLowerCase().includes(lc));
  if (match) {
    // Strip "Name: " prefix if backfill formatted it that way.
    const prefixRe = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
    return match.content.replace(prefixRe, "");
  }
  return null;
}

function pickImage(name: string, media: ProductMediaRow[]): ProductMediaRow | null {
  const lc = name.trim().toLowerCase();
  const products = media.filter((m) => m.type === "product");
  // 1) crop_data.linked_product_name exact-ish
  const linked = products.find(
    (m) => (m.crop_data?.linked_product_name ?? "").trim().toLowerCase() === lc,
  );
  if (linked) return linked;
  // 2) crop_data.linked_product_name contains
  const partial = products.find(
    (m) => (m.crop_data?.linked_product_name ?? "").trim().toLowerCase().includes(lc),
  );
  if (partial) return partial;
  return null;
}

export function ProductCardGrid({ products, descriptions, media, actorName }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const cards = useMemo(
    () =>
      products.map((p) => ({
        tag: p,
        description: pickDescription(p.entry_name, descriptions),
        image: pickImage(p.entry_name, media),
      })),
    [products, descriptions, media],
  );

  if (cards.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c, i) => {
          const isRich = Boolean(c.description || c.image || c.tag.source_url);
          return (
            <button
              type="button"
              key={`${c.tag.entry_name}-${i}`}
              onClick={() => setOpenIdx(i)}
              className={cn(
                "group text-left flex flex-col rounded-md border bg-surface border-border/60 hover:border-border-accent transition-colors overflow-hidden",
                !isRich && "bg-surface/60",
              )}
            >
              {c.image ? (
                <div className="aspect-video bg-elevated overflow-hidden">
                  <img
                    src={c.image.url}
                    alt={c.tag.entry_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
              ) : isRich ? (
                <div className="aspect-video bg-gradient-to-br from-accent-blue/10 via-accent-teal/10 to-accent-green/10 flex items-center justify-center">
                  <span className="text-2xl font-semibold text-foreground-muted">
                    {c.tag.entry_name.trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
              ) : null}
              <div className="p-3 flex-1 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground leading-snug">
                    {c.tag.entry_name}
                  </span>
                  {c.tag.confidence && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider shrink-0",
                        c.tag.confidence === "high" && "bg-success/10 text-success border-success/30",
                        c.tag.confidence === "medium" && "bg-info/10 text-info border-info/30",
                        c.tag.confidence === "low" && "bg-warning/10 text-warning border-warning/30",
                      )}
                    >
                      {c.tag.confidence}
                    </Badge>
                  )}
                </div>
                {c.description ? (
                  <p className="text-xs italic text-foreground-secondary line-clamp-3 leading-relaxed">
                    {c.description}
                  </p>
                ) : c.tag.evidence ? (
                  <p className="text-xs italic text-foreground-muted line-clamp-2 leading-relaxed">
                    “{c.tag.evidence}”
                  </p>
                ) : null}
                {c.tag.source_url && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-foreground-muted mt-auto pt-1">
                    <ExternalLink className="w-3 h-3" />
                    {hostnameOf(c.tag.source_url)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={openIdx !== null} onOpenChange={(v) => !v && setOpenIdx(null)}>
        <DialogContent className="max-w-xl bg-elevated border-border">
          {openIdx !== null && (() => {
            const c = cards[openIdx];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-foreground">{c.tag.entry_name}</DialogTitle>
                </DialogHeader>
                {c.image && (
                  <img
                    src={c.image.url}
                    alt={c.tag.entry_name}
                    className="w-full max-h-[40vh] object-contain rounded border border-border bg-surface"
                  />
                )}
                {c.description && (
                  <p className="text-sm text-foreground-secondary leading-relaxed italic">
                    {c.description}
                  </p>
                )}
                {c.tag.evidence && (
                  <div className="text-xs text-foreground-muted">
                    <div className="uppercase tracking-wider mb-1">Evidence</div>
                    <p className="italic leading-relaxed">“{c.tag.evidence}”</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
                  {c.tag.confidence && <span className="uppercase">Confidence: {c.tag.confidence}</span>}
                  {c.tag.source_url && (
                    <a
                      href={c.tag.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-teal hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {hostnameOf(c.tag.source_url)}
                    </a>
                  )}
                  {!c.description && !c.tag.evidence && !c.image && (
                    <span className="inline-flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      No additional data yet for "{c.tag.entry_name}" on {actorName}.
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
