/**
 * Rich product cards rendered on the DB-side actor profile.
 *
 * V3 batch #4 — per-product auto-enrichment.
 * - Per-card "Enrich" button (admin/owner) calls enrich-product-page.
 *   Falls back to a manual URL dialog when discovery fails.
 * - Detail modal shows carousel, full description, specs, datasheet links,
 *   and LLM-suggested ontology tags (consultant approval required — surfaced
 *   read-only, never auto-applied).
 * - Per-card "Add image / Replace" buttons from batch #3 Area 2 are preserved
 *   as a manual fallback when auto-enrichment can't find an image.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Info, ImagePlus, Replace, Sparkles, Loader2, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { productSlug } from "@/lib/productSlug";
import ProvenanceBadge from "@/components/actor-profile/ProvenanceBadge";

export interface ProductTag {
  entry_name: string;
  evidence?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  source_url?: string | null;
}

export interface ProductDescriptionRow {
  type: string;
  content: string;
  name?: string | null;
  source_url?: string | null;
  metadata?: any;
}

export interface ProductMediaRow {
  id: string;
  type: string;
  url: string;
  crop_data?: { linked_product_name?: string | null; alt?: string | null } | null;
}

interface Props {
  products: ProductTag[];
  descriptions: ProductDescriptionRow[];
  media: ProductMediaRow[];
  actorId?: string;
  actorName: string;
  /** V3 batch #3 Area 2 — when true, show per-card add/replace image buttons. */
  editable?: boolean;
  onAddImage?: (productName: string) => void;
  onReplaceImage?: (productName: string, mediaId: string) => void;
  /** Called after a successful enrichment so the parent can refresh data. */
  onEnriched?: () => void;
}

function hostnameOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function pickDescription(name: string, descs: ProductDescriptionRow[]): ProductDescriptionRow | null {
  const lc = name.trim().toLowerCase();
  const product = descs.filter((d) => d.type === "product");
  // 1) Exact name column match (set by enrich-product-page).
  const exact = product.find((d) => (d.name ?? "").trim().toLowerCase() === lc);
  if (exact) return exact;
  // 2) Content mentions the product name (legacy backfilled rows).
  const match = product.find((d) => d.content.toLowerCase().includes(lc));
  return match ?? null;
}

function pickImages(name: string, media: ProductMediaRow[]): ProductMediaRow[] {
  const lc = name.trim().toLowerCase();
  const products = media.filter((m) => m.type === "product");
  const exact = products.filter(
    (m) => (m.crop_data?.linked_product_name ?? "").trim().toLowerCase() === lc,
  );
  if (exact.length > 0) return exact;
  return products.filter(
    (m) => (m.crop_data?.linked_product_name ?? "").trim().toLowerCase().includes(lc),
  );
}

function pickDatasheets(name: string, media: ProductMediaRow[]): ProductMediaRow[] {
  const lc = name.trim().toLowerCase();
  const ds = media.filter((m) => m.type === "datasheet");
  return ds.filter(
    (m) => (m.crop_data?.linked_product_name ?? "").trim().toLowerCase().includes(lc),
  );
}

function stripNamePrefix(name: string, content: string): string {
  const prefixRe = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
  return content.replace(prefixRe, "");
}

export function ProductCardGrid({
  products,
  descriptions,
  media,
  actorId,
  actorName,
  editable,
  onAddImage,
  onReplaceImage,
  onEnriched,
}: Props) {
  const navigate = useNavigate();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [enrichingName, setEnrichingName] = useState<string | null>(null);
  const [manualUrlFor, setManualUrlFor] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [carouselIdx, setCarouselIdx] = useState(0);

  const cards = useMemo(
    () =>
      products.map((p) => {
        const descRow = pickDescription(p.entry_name, descriptions);
        const description = descRow ? stripNamePrefix(p.entry_name, descRow.content) : null;
        const images = pickImages(p.entry_name, media);
        const datasheets = pickDatasheets(p.entry_name, media);
        const metadata = descRow?.metadata ?? null;
        return {
          tag: p,
          description,
          descRow,
          images,
          primaryImage: images[0] ?? null,
          datasheets,
          metadata,
        };
      }),
    [products, descriptions, media],
  );

  if (cards.length === 0) return null;

  const enrich = async (productName: string, overrideUrl?: string) => {
    if (!actorId) {
      toast.error("Missing actor id — cannot enrich");
      return;
    }
    setEnrichingName(productName);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-product-page", {
        body: { actor_id: actorId, product_name: productName, override_url: overrideUrl ?? undefined },
      });
      if (error) {
        toast.error(`Enrichment failed: ${error.message ?? "unknown error"}`);
        return;
      }
      if (!data?.found) {
        toast.error(
          `Could not find a product page for "${productName}" automatically. Click "Enrich" again to enter a URL manually.`,
        );
        setManualUrlFor(productName);
        setManualUrl("");
        return;
      }
      toast.success(
        `Enriched "${productName}": ${data.images_added} image(s), ${
          data.description_updated ? "description updated" : "no description change"
        }, ${data.specs_count} spec(s), ${data.datasheets_added} datasheet(s)`,
      );
      onEnriched?.();
    } catch (e: any) {
      toast.error(`Enrichment failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setEnrichingName(null);
    }
  };

  const openDetail = (i: number) => {
    const name = cards[i]?.tag.entry_name;
    // V3 Batch C §1 — navigate to the dedicated sub-route. Fall back to the
    // legacy modal only if we don't have an actorId (defensive).
    if (actorId && name) {
      navigate(`/actors/${actorId}/products/${productSlug(name)}`);
      return;
    }
    setOpenIdx(i);
    setCarouselIdx(0);
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c, i) => {
          const isEnriching = enrichingName === c.tag.entry_name;
          return (
            <div
              key={`${c.tag.entry_name}-${i}`}
              className={cn(
                "group relative text-left flex flex-col rounded-md border bg-surface border-border/60 hover:border-border-accent transition-colors overflow-hidden cursor-pointer",
              )}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDetail(i);
                }
              }}
            >
              {editable && (
                <div className="absolute top-2 right-2 z-10 flex gap-1">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-2 text-[10px] uppercase tracking-wider shadow"
                    disabled={isEnriching}
                    onClick={(e) => {
                      e.stopPropagation();
                      enrich(c.tag.entry_name);
                    }}
                    title="Auto-enrich this product from the actor's website"
                  >
                    {isEnriching ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-1" />
                    )}
                    {isEnriching ? "Enriching" : "Enrich"}
                  </Button>
                  {(onAddImage || onReplaceImage) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-[10px] uppercase tracking-wider shadow"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (c.primaryImage && onReplaceImage)
                          onReplaceImage(c.tag.entry_name, c.primaryImage.id);
                        else if (onAddImage) onAddImage(c.tag.entry_name);
                      }}
                      title={c.primaryImage ? "Replace image" : "Add image manually"}
                    >
                      {c.primaryImage ? (
                        <Replace className="w-3 h-3" />
                      ) : (
                        <ImagePlus className="w-3 h-3" />
                      )}
                    </Button>
                  )}
                </div>
              )}
              {c.primaryImage ? (
                <div className="aspect-video bg-elevated overflow-hidden">
                  <img
                    src={c.primaryImage.url}
                    alt={c.primaryImage.crop_data?.alt || c.tag.entry_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-accent-blue/10 via-accent-teal/10 to-accent-green/10 flex flex-col items-center justify-center gap-1">
                  <span className="text-2xl font-semibold text-foreground-muted">
                    {c.tag.entry_name.trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                  {!c.description && (
                    <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      {editable ? "Click Enrich to fetch details" : "Awaiting enrichment"}
                    </span>
                  )}
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground leading-snug">
                    {c.tag.entry_name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <ProvenanceBadge
                      source={(c.descRow as any)?.source ?? (c.tag.source_url ? "auto_enrichment" : null)}
                      source_url={c.tag.source_url ?? (c.descRow as any)?.source_url ?? null}
                      evidence={c.tag.evidence ?? null}
                      confidence={c.tag.confidence ?? null}
                      verified_at={(c.descRow as any)?.verified_at ?? null}
                      verifier_id={(c.descRow as any)?.verifier_id ?? null}
                      decays_at={(c.descRow as any)?.decays_at ?? null}
                      size="sm"
                    />
                    {c.tag.confidence && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase tracking-wider",
                          c.tag.confidence === "high" && "bg-success/10 text-success border-success/30",
                          c.tag.confidence === "medium" && "bg-info/10 text-info border-info/30",
                          c.tag.confidence === "low" && "bg-warning/10 text-warning border-warning/30",
                        )}
                      >
                        {c.tag.confidence}
                      </Badge>
                    )}
                  </div>
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
                <div className="flex items-center gap-2 mt-auto pt-1 text-[11px] text-foreground-muted">
                  {c.images.length > 1 && <span>{c.images.length} images</span>}
                  {c.datasheets.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {c.datasheets.length}
                    </span>
                  )}
                  {c.tag.source_url && (
                    <span className="inline-flex items-center gap-1 ml-auto">
                      <ExternalLink className="w-3 h-3" />
                      {hostnameOf(c.tag.source_url)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      <Dialog open={openIdx !== null} onOpenChange={(v) => !v && setOpenIdx(null)}>
        <DialogContent className="max-w-2xl bg-elevated border-border max-h-[90vh] overflow-y-auto">
          {openIdx !== null && (() => {
            const c = cards[openIdx];
            const specs: Array<{ key: string; value: string }> = c.metadata?.specs ?? [];
            const suggestedTags: Array<{ entry_name: string; confidence: string }> =
              c.metadata?.suggested_tags ?? [];
            const productUrl: string | null = c.metadata?.product_url ?? c.tag.source_url ?? null;
            const isEnriching = enrichingName === c.tag.entry_name;
            const showCarousel = c.images.length > 0;
            const currentImage = showCarousel ? c.images[carouselIdx % c.images.length] : null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center justify-between gap-3">
                    <span>{c.tag.entry_name}</span>
                    <div className="flex items-center gap-2">
                      {c.tag.confidence && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] uppercase tracking-wider",
                            c.tag.confidence === "high" && "bg-success/10 text-success border-success/30",
                            c.tag.confidence === "medium" && "bg-info/10 text-info border-info/30",
                            c.tag.confidence === "low" && "bg-warning/10 text-warning border-warning/30",
                          )}
                        >
                          {c.tag.confidence}
                        </Badge>
                      )}
                      {editable && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isEnriching}
                          onClick={() => enrich(c.tag.entry_name)}
                        >
                          {isEnriching ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 mr-1" />
                          )}
                          {isEnriching ? "Enriching" : "Re-enrich"}
                        </Button>
                      )}
                    </div>
                  </DialogTitle>
                </DialogHeader>

                {showCarousel && currentImage && (
                  <div className="relative">
                    <img
                      src={currentImage.url}
                      alt={currentImage.crop_data?.alt || c.tag.entry_name}
                      className="w-full max-h-[40vh] object-contain rounded border border-border bg-surface"
                    />
                    {c.images.length > 1 && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                          onClick={() => setCarouselIdx((i) => (i - 1 + c.images.length) % c.images.length)}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                          onClick={() => setCarouselIdx((i) => (i + 1) % c.images.length)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-foreground-muted bg-surface/80 px-2 py-0.5 rounded">
                          {(carouselIdx % c.images.length) + 1} / {c.images.length}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {c.description && (
                  <p className="text-sm text-foreground-secondary leading-relaxed whitespace-pre-wrap">
                    {c.description}
                  </p>
                )}

                {!c.description && c.tag.evidence && (
                  <div className="text-xs text-foreground-muted">
                    <div className="uppercase tracking-wider mb-1">Evidence</div>
                    <p className="italic leading-relaxed">“{c.tag.evidence}”</p>
                  </div>
                )}

                {specs.length > 0 && (
                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="bg-surface px-3 py-1.5 text-[10px] uppercase tracking-wider text-foreground-muted">
                      Specifications
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {specs.map((s, i) => (
                          <tr key={i} className="border-t border-border/60">
                            <td className="px-3 py-1.5 text-foreground-muted w-1/3 align-top">{s.key}</td>
                            <td className="px-3 py-1.5 text-foreground">{s.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {c.datasheets.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      Datasheets
                    </div>
                    {c.datasheets.map((d) => (
                      <a
                        key={d.id}
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-accent-teal hover:underline"
                      >
                        <FileText className="w-3 h-3" />
                        {d.url.split("/").pop() ?? d.url}
                      </a>
                    ))}
                  </div>
                )}

                {suggestedTags.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      Suggested additional tags
                      <span className="ml-1 text-foreground-muted/70 normal-case tracking-normal">
                        — pending consultant approval, not yet applied
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedTags.map((t, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className={cn(
                            "text-[10px] uppercase tracking-wider",
                            t.confidence === "high" && "bg-success/10 text-success border-success/30",
                            t.confidence === "medium" && "bg-info/10 text-info border-info/30",
                            t.confidence === "low" && "bg-warning/10 text-warning border-warning/30",
                          )}
                        >
                          {t.entry_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
                  {productUrl && (
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-teal hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Source: {hostnameOf(productUrl)}
                    </a>
                  )}
                  {editable && onAddImage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAddImage(c.tag.entry_name);
                        setOpenIdx(null);
                      }}
                    >
                      <ImagePlus className="w-3 h-3 mr-1" /> Add image manually
                    </Button>
                  )}
                  {!c.description && !c.tag.evidence && !c.primaryImage && (
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

      {/* Manual URL fallback dialog */}
      <Dialog open={manualUrlFor !== null} onOpenChange={(v) => !v && setManualUrlFor(null)}>
        <DialogContent className="max-w-md bg-elevated border-border">
          <DialogHeader>
            <DialogTitle>Enrich from URL</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-foreground-muted">
            Auto-discovery couldn't find a product page for{" "}
            <span className="text-foreground font-medium">{manualUrlFor}</span>. Paste the URL
            of the product page on {actorName}'s website to enrich from it directly.
          </p>
          <Input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://example.com/products/anti-drone-system"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setManualUrlFor(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!manualUrl.trim() || enrichingName === manualUrlFor}
              onClick={async () => {
                const name = manualUrlFor!;
                const url = manualUrl.trim();
                setManualUrlFor(null);
                await enrich(name, url);
              }}
            >
              <Sparkles className="w-3 h-3 mr-1" /> Enrich from this URL
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
