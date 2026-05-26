/**
 * Shared types for enrichment metadata stored inside
 * `user_personal_actors.analysis_data.<ontology_section>`.
 *
 * Source: prompt 31 / `08-app-structure-and-db-design.md` Section 6
 * (Metadata preservation for accepted items).
 *
 * NOTE: write shape (after prompt 31) is `EnrichmentAcceptedItem` objects.
 * Reads must remain backward compatible with:
 *   - plain strings (older accepts and pipeline simple-shape)
 *   - pipeline category-with-entries objects from Step 3 / Step 4
 *   - the older `{entryName | name | rawName}` variants
 */

export type EnrichmentSource =
  | "manual"
  | "url_scrape"
  | "document"
  | "web_search"
  | "registry" // for completeness; registry writes to top-level cols, not ontology
  | "pipeline_search" // derived from Step 3 JSONB
  | "pipeline_analysis"; // derived from Step 4 JSONB

export interface EnrichmentAcceptedItem {
  entry_name: string;
  source: EnrichmentSource;
  source_url?: string | null;
  /** filename for documents */
  source_description?: string | null;
  evidence?: string;
  /** Per-item prose description — only set for products/services from analyze-actor. */
  description?: string;
  confidence?: "high" | "medium" | "low";
  /** ISO 8601; only set by enrichment methods, not pipeline */
  accepted_at?: string;
}

export const SOURCE_LABEL: Record<EnrichmentSource, string> = {
  manual: "Manual",
  url_scrape: "URL scrape",
  document: "Document",
  web_search: "Web search",
  registry: "Registry",
  pipeline_search: "Pipeline search",
  pipeline_analysis: "Pipeline analysis",
};

/**
 * Type guard — does this object look like a serialized
 * `EnrichmentAcceptedItem`? We key off the presence of both
 * `entry_name` (string) and `source` (string in known set).
 */
export function isEnrichmentAcceptedItem(
  v: unknown,
): v is EnrichmentAcceptedItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.entry_name !== "string") return false;
  if (typeof o.source !== "string") return false;
  return (
    o.source === "manual" ||
    o.source === "url_scrape" ||
    o.source === "document" ||
    o.source === "web_search" ||
    o.source === "registry" ||
    o.source === "pipeline_search" ||
    o.source === "pipeline_analysis"
  );
}
