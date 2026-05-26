/**
 * Read-side helper for ontology JSONB.
 *
 * Returns a flat list of `{name, meta}` pairs from any of the supported
 * shapes:
 *   - plain string                   → meta: null
 *   - EnrichmentAcceptedItem (new)   → meta: that object
 *   - older `{entryName | name | rawName | …}` variants → meta inferred
 *   - pipeline `{categoryName, entries: […]}`           → meta inferred
 *     - string entries        → source: pipeline_search
 *     - {entryName, evidence} → source: pipeline_analysis
 *     - {entryName} only      → source: pipeline_search
 *
 * Pure: no DB calls, no React.
 */

import {
  isEnrichmentAcceptedItem,
  type EnrichmentAcceptedItem,
} from "@/types/enrichment";

export interface DisplayEntry {
  name: string;
  /** null when only a display name was extractable. */
  meta: EnrichmentAcceptedItem | null;
}

function nameOfObject(o: Record<string, unknown>): string | null {
  const n =
    (o.entry_name as string | undefined) ??
    (o.entryName as string | undefined) ??
    (o.categoryName as string | undefined) ??
    (o.domainName as string | undefined) ??
    (o.productName as string | undefined) ??
    (o.serviceName as string | undefined) ??
    (o.name as string | undefined) ??
    (o.rawName as string | undefined);
  return typeof n === "string" && n.trim() ? n : null;
}

function evidenceOfObject(o: Record<string, unknown>): string | undefined {
  const e = o.evidence;
  return typeof e === "string" && e.trim() ? e : undefined;
}

function descriptionOfObject(o: Record<string, unknown>): string | undefined {
  const d = o.description;
  return typeof d === "string" && d.trim() ? d : undefined;
}

function sourceUrlOfObject(o: Record<string, unknown>): string | undefined {
  const u = o.source_url;
  return typeof u === "string" && u.trim() ? u : undefined;
}

function confidenceOfObject(
  o: Record<string, unknown>,
): EnrichmentAcceptedItem["confidence"] | undefined {
  const c = o.confidence;
  if (c === "high" || c === "medium" || c === "low") return c;
  return undefined;
}

export function readOntologyEntries(arr: unknown): DisplayEntry[] {
  if (!Array.isArray(arr)) return [];
  const out: DisplayEntry[] = [];

  for (const item of arr) {
    if (typeof item === "string") {
      out.push({ name: item, meta: null });
      continue;
    }
    if (!item || typeof item !== "object") continue;

    // New canonical write shape
    if (isEnrichmentAcceptedItem(item)) {
      out.push({ name: item.entry_name, meta: item });
      continue;
    }

    const o = item as Record<string, unknown>;

    // Pipeline category-with-entries
    if (Array.isArray(o.entries)) {
      for (const e of o.entries) {
        if (typeof e === "string") {
          out.push({
            name: e,
            meta: { entry_name: e, source: "pipeline_search" },
          });
          continue;
        }
        if (e && typeof e === "object") {
          const eo = e as Record<string, unknown>;
          const name = nameOfObject(eo);
          if (!name) continue;
          const evidence = evidenceOfObject(eo);
          const confidence = confidenceOfObject(eo);
          out.push({
            name,
            meta: {
              entry_name: name,
              source: evidence ? "pipeline_analysis" : "pipeline_search",
              evidence,
              confidence,
            },
          });
        }
      }
      continue;
    }

    // Older single-object variants
    const name = nameOfObject(o);
    if (!name) continue;
    const evidence = evidenceOfObject(o);
    const confidence = confidenceOfObject(o);
    out.push({
      name,
      meta: {
        entry_name: name,
        source: evidence ? "pipeline_analysis" : "pipeline_search",
        evidence,
        confidence,
      },
    });
  }

  return out;
}
