import {
  Pencil,
  Link2,
  Building2,
  FileText,
  Upload,
  ExternalLink,
  Search,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ENRICHMENT_MATRIX,
  ENRICHMENT_METHOD_LABEL,
  type EnrichmentMethod,
  type SectionKey,
} from "@/config/enrichmentMethods";
import { cn } from "@/lib/utils";

const METHOD_ICON: Record<EnrichmentMethod, LucideIcon> = {
  manual: Pencil,
  scrape_url: Link2,
  registry: Building2,
  upload_doc: FileText,
  upload_file: Upload,
  paste_link: ExternalLink,
  web_search: Search,
};

interface EnrichmentToolbarProps {
  sectionKey: SectionKey;
  /**
   * Optional handler for the Manual icon. When provided, the manual icon is
   * enabled for this section. When omitted, the manual icon renders disabled
   * with a "Coming soon" tooltip — same as every other (not-yet-wired) method.
   */
  onManualClick?: () => void;
  /**
   * Optional handler for the Scrape-from-URL icon. When provided, the icon is
   * enabled for this section. When omitted, it renders disabled with a
   * "Coming soon" tooltip.
   */
  onUrlScrapeClick?: () => void;
  /**
   * Optional handler for the Registry (Building2) icon. When provided, the
   * icon is enabled. When omitted, it renders disabled with "Coming soon".
   */
  onRegistryClick?: () => void;
}

/**
 * Per-section enrichment toolbar shown in the right edge of a section header.
 * Renders one icon per allowed method (per ENRICHMENT_MATRIX).
 *
 * Only "Manual" is wired in this prompt (Phase 6B.7 part 1). All other icons
 * render disabled with a "Coming soon" tooltip.
 *
 * Click events stop propagation so they don't toggle the section open/closed.
 */
export const EnrichmentToolbar = ({
  sectionKey,
  onManualClick,
  onUrlScrapeClick,
  onRegistryClick,
}: EnrichmentToolbarProps) => {
  const methods = ENRICHMENT_MATRIX[sectionKey] ?? [];

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {methods.map((method) => {
          const Icon = METHOD_ICON[method];
          const enabled =
            (method === "manual" && Boolean(onManualClick)) ||
            (method === "scrape_url" && Boolean(onUrlScrapeClick)) ||
            (method === "registry" && Boolean(onRegistryClick));
          const label = ENRICHMENT_METHOD_LABEL[method];
          const tooltip = enabled ? label : "Coming soon";

          return (
            <Tooltip key={method}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  disabled={!enabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!enabled) return;
                    if (method === "manual" && onManualClick) onManualClick();
                    else if (method === "scrape_url" && onUrlScrapeClick)
                      onUrlScrapeClick();
                    else if (method === "registry" && onRegistryClick)
                      onRegistryClick();
                  }}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded transition-colors",
                    enabled
                      ? "text-foreground-muted hover:text-foreground hover:bg-elevated cursor-pointer"
                      : "text-foreground-muted/50 cursor-not-allowed",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
