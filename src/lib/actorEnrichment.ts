/**
 * Pure helpers for writing enrichment data back to a personal actor's
 * analysis_data JSONB.
 *
 * No DB access here — callers run the supabase client themselves.
 */

/**
 * Merge new string items into an existing ontology-shape JSONB array.
 *
 * - Case-insensitive dedup against both existing string entries AND any
 *   nested entry names found inside category-with-entries objects.
 * - Preserves any non-string entries already present (e.g. AI-generated
 *   `{categoryName, entries: [...]}` objects) untouched.
 * - Appended manual items are written as plain strings — `flattenOntologyArray`
 *   on the read side already handles mixed string + object shapes.
 *
 * @param existing  current value at analysis_data.<sectionKey> (may be undefined)
 * @param newItems  raw user-entered strings (will be trimmed; empty dropped)
 * @returns the merged array suitable for writing back
 */
export function appendManualOntologyItems(
  existing: unknown,
  newItems: string[],
): unknown[] {
  const base: unknown[] = Array.isArray(existing) ? [...existing] : [];

  // Build a lowercase set of every name already present so we don't add
  // a duplicate of something the AI already produced inside a nested shape.
  const seen = new Set<string>();
  for (const item of base) {
    if (typeof item === "string") {
      seen.add(item.trim().toLowerCase());
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name =
        (o.entryName as string | undefined) ??
        (o.categoryName as string | undefined) ??
        (o.name as string | undefined) ??
        (o.rawName as string | undefined);
      if (typeof name === "string") seen.add(name.trim().toLowerCase());
      if (Array.isArray(o.entries)) {
        for (const e of o.entries) {
          if (typeof e === "string") seen.add(e.trim().toLowerCase());
          else if (e && typeof e === "object") {
            const eo = e as Record<string, unknown>;
            const ename =
              (eo.entryName as string | undefined) ??
              (eo.name as string | undefined) ??
              (eo.rawName as string | undefined);
            if (typeof ename === "string") seen.add(ename.trim().toLowerCase());
          }
        }
      }
    }
  }

  for (const raw of newItems) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    base.push(trimmed);
  }

  return base;
}
