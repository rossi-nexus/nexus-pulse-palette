/**
 * Enrichment method availability per profile section.
 *
 * Single source of truth for which enrichment methods (icons) appear on
 * each section header of the actor profile page.
 *
 * Source: 08-app-structure-and-db-design.md Section 6.
 *
 * NOTE: This matrix only describes which methods are *exposed* per section.
 * Whether a method is *wired* (clickable) vs disabled-with-"Coming soon"
 * tooltip is decided by the EnrichmentToolbar consumer.
 */

export type EnrichmentMethod =
  | "manual"
  | "scrape_url"
  | "registry"
  | "upload_doc"
  | "upload_file"
  | "paste_link"
  | "web_search";

export type SectionKey =
  | "identity"
  | "capabilities"
  | "competences"
  | "domains"
  | "products"
  | "services"
  | "classification"
  | "standards"
  | "customers"
  | "contacts"
  | "media"
  | "sources";

export const ENRICHMENT_METHOD_LABEL: Record<EnrichmentMethod, string> = {
  manual: "Manual entry",
  scrape_url: "Scrape from URL",
  registry: "Search registry",
  upload_doc: "Upload document",
  upload_file: "Upload file",
  paste_link: "Paste link",
  web_search: "Web search",
};

export const ENRICHMENT_MATRIX: Record<SectionKey, EnrichmentMethod[]> = {
  identity: ["manual", "scrape_url", "registry"],
  capabilities: ["manual", "scrape_url", "upload_doc", "web_search"],
  competences: ["manual", "scrape_url", "upload_doc", "web_search"],
  domains: ["manual", "scrape_url", "upload_doc", "web_search"],
  products: ["manual", "scrape_url", "upload_doc", "web_search"],
  services: ["manual", "scrape_url", "upload_doc", "web_search"],
  classification: ["manual", "upload_doc", "web_search"],
  standards: ["manual", "scrape_url", "upload_doc", "web_search"],
  customers: ["manual", "scrape_url", "upload_doc", "web_search"],
  contacts: ["manual", "scrape_url", "upload_doc"],
  media: ["manual", "upload_file"],
  sources: ["paste_link"],
};
