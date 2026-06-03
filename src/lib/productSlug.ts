// V3 Batch C — per-product sub-route slug helpers.
// Lowercase, non-alphanumerics → hyphens, collapsed and trimmed.

export function productSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function matchesProductSlug(name: string, slug: string): boolean {
  return productSlug(name) === slug;
}

/** De-slugify for ILIKE fallback when the canonical slug doesn't match. */
export function deslugForIlike(slug: string): string {
  return `%${slug.replace(/-/g, "%")}%`;
}
