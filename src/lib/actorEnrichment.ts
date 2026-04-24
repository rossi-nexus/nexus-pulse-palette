/**
 * Pure helpers for writing enrichment data back to a personal actor's
 * analysis_data JSONB.
 *
 * No DB access here — callers run the supabase client themselves.
 */

import {
  isEnrichmentAcceptedItem,
  type EnrichmentAcceptedItem,
} from "@/types/enrichment";

export type NewItem = string | EnrichmentAcceptedItem;

/**
 * Walk the existing JSONB shapes and collect every entry-name string that's
 * already present (case-folded). Covers:
 *   - plain strings
 *   - `EnrichmentAcceptedItem` objects (new write shape)
 *   - older `{entryName | name | rawName | categoryName | …}` variants
 *   - pipeline `{categoryName, entries: [...]}` shape (entries can be
 *     strings or any of the object variants above)
 */
function collectExistingNames(existing: unknown[]): Set<string> {
  const seen = new Set<string>();
  const add = (s: unknown) => {
    if (typeof s === "string") {
      const v = s.trim().toLowerCase();
      if (v) seen.add(v);
    }
  };

  const visitObject = (o: Record<string, unknown>) => {
    add(
      (o.entry_name as string | undefined) ??
        (o.entryName as string | undefined) ??
        (o.categoryName as string | undefined) ??
        (o.domainName as string | undefined) ??
        (o.productName as string | undefined) ??
        (o.serviceName as string | undefined) ??
        (o.name as string | undefined) ??
        (o.rawName as string | undefined),
    );
    if (Array.isArray(o.entries)) {
      for (const e of o.entries) {
        if (typeof e === "string") add(e);
        else if (e && typeof e === "object")
          visitObject(e as Record<string, unknown>);
      }
    }
  };

  for (const item of existing) {
    if (typeof item === "string") add(item);
    else if (item && typeof item === "object")
      visitObject(item as Record<string, unknown>);
  }
  return seen;
}

/**
 * Merge new items into an existing ontology-shape JSONB array.
 *
 * Accepts either bare strings (legacy convenience) or full
 * `EnrichmentAcceptedItem` objects. Bare strings are normalized to manual
 * accepts with an `accepted_at` timestamp.
 *
 * - Case-insensitive dedup against every name extractable from existing
 *   entries (string, enriched object, pipeline category-with-entries,
 *   older shape variants).
 * - Preserves any non-string entries already present (e.g. AI-generated
 *   `{categoryName, entries: [...]}` objects) untouched in place.
 * - Appended items are written as `EnrichmentAcceptedItem` objects so the
 *   read side can surface their metadata in the UI.
 *
 * @param existing  current value at analysis_data.<sectionKey> (may be undefined)
 * @param newItems  array of strings and/or EnrichmentAcceptedItem
 * @returns the merged array suitable for writing back
 */
export function appendManualOntologyItems(
  existing: unknown,
  newItems: NewItem[],
): unknown[] {
  const base: unknown[] = Array.isArray(existing) ? [...existing] : [];
  const seen = collectExistingNames(base);
  const nowIso = new Date().toISOString();

  for (const raw of newItems) {
    let item: EnrichmentAcceptedItem;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      item = {
        entry_name: trimmed,
        source: "manual",
        accepted_at: nowIso,
      };
    } else if (isEnrichmentAcceptedItem(raw)) {
      const trimmed = raw.entry_name.trim();
      if (!trimmed) continue;
      item = {
        ...raw,
        entry_name: trimmed,
        accepted_at: raw.accepted_at ?? nowIso,
      };
    } else {
      continue;
    }
    const key = item.entry_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    base.push(item);
  }

  return base;
}
