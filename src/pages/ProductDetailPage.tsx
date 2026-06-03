// V3 Batch C §1 — Per-product detail sub-route.
// Route: /actors/:actorId/products/:productSlug
//
// Replaces the per-product modal previously in ProductCardGrid. Reads
// actor_descriptions (type='product') + actor_media (type in product/datasheet)
// scoped to the product name. Slug match is tolerant: exact slug first, then
// ILIKE fallback on the description's name column.
//
// Editors can re-enrich (admin/owner/consultant), and the response surfaces
// referenced_brand_urls (Batch C §4) as clickable chips for editors who hit
// the discovery-miss case.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { productSlug, deslugForIlike } from "@/lib/productSlug";
import { useAdminAccess } from "@/hooks/useAdminAccess";

interface ActorRow {
  id: string;
  legal_name: string;
  websites: string[] | null;
  verifier_id: string | null;
}

interface DescRow {
  id: string;
  name: string | null;
  content: string;
  source: string | null;
  source_url: string | null;
  metadata: any;
}

interface MediaRow {
  id: string;
  type: string;
  url: string;
  crop_data: any;
}

interface BrandSuggestion {
  domain: string;
  anchor_text?: string | null;
  mention_context?: string | null;
}

function hostname(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

const ProductDetailPage = () => {
  const { actorId, productSlug: slug } = useParams<{ actorId: string; productSlug: string }>();
  const navigate = useNavigate();
  const { hasAccess: isAdmin } = useAdminAccess();

  const [actor, setActor] = useState<ActorRow | null>(null);
  const [desc, setDesc] = useState<DescRow | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [overrideUrl, setOverrideUrl] = useState("");
  const [brandSuggestions, setBrandSuggestions] = useState<BrandSuggestion[]>([]);
  const [productName, setProductName] = useState<string>("");

  useEffect(() => {
    if (!actorId || !slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const { data: actorRow, error: actorErr } = await supabase
          .from("actors")
          .select("id, legal_name, websites, verifier_id")
          .eq("id", actorId)
          .maybeSingle();
        if (actorErr || !actorRow) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!cancelled) setActor(actorRow as ActorRow);

        // Load all product descriptions for this actor; pick by slug match.
        const { data: descs } = await supabase
          .from("actor_descriptions")
          .select("id, name, content, source, source_url, metadata")
          .eq("actor_id", actorId)
          .eq("type", "product");
        const all = (descs ?? []) as DescRow[];
        let pick = all.find((d) => d.name && productSlug(d.name) === slug);
        if (!pick) {
          // Fallback: ILIKE the de-slugified name in case slugs drifted.
          const ilikePat = deslugForIlike(slug);
          pick = all.find(
            (d) => d.name && d.name.toLowerCase().replace(/[^a-z0-9]+/g, "%").includes(slug),
          );
          if (!pick && all.length > 0) {
            const { data: ilikeRows } = await supabase
              .from("actor_descriptions")
              .select("id, name, content, source, source_url, metadata")
              .eq("actor_id", actorId)
              .eq("type", "product")
              .ilike("name", ilikePat)
              .maybeSingle();
            if (ilikeRows) pick = ilikeRows as DescRow;
          }
        }
        if (!cancelled) {
          setDesc(pick ?? null);
          // If no description row but slug exists, treat the slug itself as the product name.
          const nm = pick?.name ?? slug.replace(/-/g, " ");
          setProductName(nm);
        }

        const { data: mediaRows } = await supabase
          .from("actor_media")
          .select("id, type, url, crop_data")
          .eq("actor_id", actorId)
          .in("type", ["product", "datasheet"]);
        if (!cancelled) setMedia((mediaRows ?? []) as MediaRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actorId, slug]);

  const productImages = useMemo(() => {
    const lc = productName.trim().toLowerCase();
    return media.filter(
      (m) =>
        m.type === "product" &&
        (m.crop_data?.linked_product_name ?? "").toString().trim().toLowerCase() === lc,
    );
  }, [media, productName]);

  const datasheets = useMemo(() => {
    const lc = productName.trim().toLowerCase();
    return media.filter(
      (m) =>
        m.type === "datasheet" &&
        (m.crop_data?.linked_product_name ?? "").toString().trim().toLowerCase().includes(lc),
    );
  }, [media, productName]);

  const metadata = desc?.metadata ?? {};
  const specs: Array<{ key: string; value: string }> = metadata?.specs ?? [];
  const suggestedTags: Array<{ entry_name: string; confidence: string }> =
    metadata?.suggested_tags ?? [];
  const productUrl: string | null = metadata?.product_url ?? desc?.source_url ?? null;

  const canEdit = isAdmin; // TODO: extend to owner / consultant once role hook is wired here.

  const reload = async () => {
    if (!actorId) return;
    const { data: descs } = await supabase
      .from("actor_descriptions")
      .select("id, name, content, source, source_url, metadata")
      .eq("actor_id", actorId)
      .eq("type", "product");
    const all = (descs ?? []) as DescRow[];
    const pick = all.find((d) => d.name && productSlug(d.name) === slug);
    if (pick) setDesc(pick);
    const { data: mediaRows } = await supabase
      .from("actor_media")
      .select("id, type, url, crop_data")
      .eq("actor_id", actorId)
      .in("type", ["product", "datasheet"]);
    setMedia((mediaRows ?? []) as MediaRow[]);
  };

  const runEnrich = async (overrideUrlArg?: string) => {
    if (!actorId || !productName) return;
    setEnriching(true);
    setBrandSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-product-page", {
        body: {
          actor_id: actorId,
          product_name: productName,
          override_url: overrideUrlArg ?? overrideUrl.trim() ?? undefined,
        },
      });
      if (error) {
        toast.error(`Enrichment failed: ${error.message ?? "unknown error"}`);
        return;
      }
      if (!data?.found) {
        const suggestions: BrandSuggestion[] = data?.referenced_brand_urls ?? [];
        setBrandSuggestions(suggestions);
        if (suggestions.length > 0) {
          toast.message(
            `No product page found on ${actor?.websites?.[0] ? hostname(actor.websites[0]) : "site"}. Try one of the suggested brand sites.`,
          );
        } else {
          toast.error(`Could not find a product page for "${productName}". Paste a URL manually below.`);
        }
        return;
      }
      toast.success(
        `Enriched: ${data.images_added} image(s), ${
          data.description_updated ? "description updated" : "no description change"
        }, ${data.specs_count} spec(s), ${data.datasheets_added} datasheet(s)`,
      );
      await reload();
    } catch (e: any) {
      toast.error(`Enrichment failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted">
        Loading product…
      </div>
    );
  }

  if (notFound || !actor) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-body-sm text-foreground-muted">Actor not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/actors")}>
          Back to actors
        </Button>
      </div>
    );
  }

  const currentImage = productImages[carouselIdx % Math.max(productImages.length, 1)] ?? null;
  const reEnrichLabel = overrideUrl.trim()
    ? `Re-enrich from ${hostname(overrideUrl)}`
    : metadata?.product_url
    ? `Re-enrich from ${hostname(metadata.product_url)}`
    : "Try auto-fill (best effort)";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="text-xs text-foreground-muted flex items-center gap-1.5">
          <Link to={`/actors/${actor.id}`} className="hover:text-foreground">
            {actor.legal_name}
          </Link>
          <span>/</span>
          <Link to={`/actors/${actor.id}`} className="hover:text-foreground">
            Products
          </Link>
          <span>/</span>
          <span className="text-foreground">{productName}</span>
        </nav>

        {/* Hero */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-light tracking-tight text-foreground">{productName}</h1>
            <div className="flex items-center gap-2">
              {desc?.source && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {desc.source.replace(/_/g, " ")}
                </Badge>
              )}
              {productUrl && (
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent-teal hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {hostname(productUrl)}
                </a>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-col items-end gap-2 max-w-xs w-full">
              <Input
                value={overrideUrl}
                onChange={(e) => setOverrideUrl(e.target.value)}
                placeholder="Manual URL override (optional)"
                className="text-xs"
              />
              <Button size="sm" disabled={enriching} onClick={() => runEnrich()}>
                {enriching ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 mr-1" />
                )}
                {enriching ? "Enriching" : reEnrichLabel}
              </Button>
            </div>
          )}
        </header>

        {/* Brand suggestions (discovery miss with referenced_brand_urls) */}
        {brandSuggestions.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
            <p className="text-xs text-foreground-secondary">
              We could not find a product page on{" "}
              <span className="font-medium text-foreground">
                {actor.websites?.[0] ? hostname(actor.websites[0]) : "the actor's site"}
              </span>
              . Try one of these instead:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {brandSuggestions.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const guess = `https://${b.domain}/`;
                    setOverrideUrl(guess);
                    void runEnrich(guess);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border bg-surface hover:bg-elevated text-foreground transition-colors"
                  title={b.anchor_text || b.mention_context || b.domain}
                >
                  <ExternalLink className="w-3 h-3" />
                  {b.domain}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Carousel */}
        {productImages.length > 0 ? (
          <div className="relative rounded-md overflow-hidden border border-border bg-elevated">
            {currentImage && (
              <img
                src={currentImage.url}
                alt={currentImage.crop_data?.alt || productName}
                className="w-full max-h-[60vh] object-contain"
              />
            )}
            {productImages.length > 1 && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() =>
                    setCarouselIdx((i) => (i - 1 + productImages.length) % productImages.length)
                  }
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setCarouselIdx((i) => (i + 1) % productImages.length)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-foreground-muted bg-surface/80 px-2 py-0.5 rounded">
                  {(carouselIdx % productImages.length) + 1} / {productImages.length}
                </div>
                <div className="flex gap-1 p-2 bg-surface border-t border-border overflow-x-auto">
                  {productImages.map((img, i) => (
                    <button
                      key={img.id}
                      onClick={() => setCarouselIdx(i)}
                      className={cn(
                        "h-12 w-16 shrink-0 rounded border overflow-hidden",
                        i === carouselIdx % productImages.length
                          ? "border-accent-teal"
                          : "border-border/60",
                      )}
                    >
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-foreground-muted">
            No product images on file.
            {canEdit && (
              <div className="mt-3">
                <Button size="sm" variant="outline">
                  <ImagePlus className="w-3 h-3 mr-1" />
                  Add image manually
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {desc?.content ? (
          <section className="prose prose-invert max-w-none">
            <p className="text-sm text-foreground-secondary leading-relaxed whitespace-pre-wrap">
              {desc.content}
            </p>
          </section>
        ) : (
          <p className="text-xs italic text-foreground-muted">
            No description yet. Use “{reEnrichLabel}” to auto-fill or paste a URL above.
          </p>
        )}

        {/* Specs */}
        {specs.length > 0 && (
          <section className="border border-border rounded-md overflow-hidden">
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
          </section>
        )}

        {/* Datasheets */}
        {datasheets.length > 0 && (
          <section className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
              Datasheets
            </div>
            <div className="space-y-1">
              {datasheets.map((d) => (
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
          </section>
        )}

        {/* Suggested tags */}
        {suggestedTags.length > 0 && (
          <section className="space-y-1.5">
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
          </section>
        )}
      </div>
    </div>
  );
};

export default ProductDetailPage;
