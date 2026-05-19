/**
 * Shared ontology prompt-block builder.
 *
 * Used by enrich-from-url, interpret-need, and populate-role to render the
 * ontology section of the LLM prompt with full metadata (description,
 * keywords, example entries, co-occurring categories) per sub-category.
 *
 * See prompt-v3-e1 for the spec.
 */

export interface OntoCategory {
  id: string;
  type: string; // 'capability' | 'competence' | 'domain' | 'product_type' | 'service_type'
  normalized_name: string;
  description: string | null;
  keywords: string[] | null;
  example_entries: string[] | null;
  co_occurring_category_ids: string[] | null;
}

export interface OntoEntry {
  id: string;
  category_id: string;
  raw_name: string;
  description?: string | null;
}

export interface BuildOntologyBlockOptions {
  /** Render description / keywords / example entries / co-occurring per category. Default true. */
  includeMetadata?: boolean;
  /** Resolve co_occurring_category_ids to display names. Default true. */
  includeCoOccurring?: boolean;
  /** Group categories under TYPE headlines (CAPABILITIES, COMPETENCES, …). Default true. */
  groupByType?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  capability: "CAPABILITIES",
  competence: "COMPETENCES",
  domain: "DOMAINS",
  product_type: "PRODUCT TYPES",
  service_type: "SERVICE TYPES",
};

const TYPE_ORDER = ["capability", "competence", "domain", "product_type", "service_type"];

function renderCategory(
  cat: OntoCategory,
  entries: OntoEntry[],
  catNameById: Map<string, string>,
  opts: Required<BuildOntologyBlockOptions>,
): string {
  const lines: string[] = [];
  lines.push(`- Category: "${cat.normalized_name}" (id: ${cat.id})`);

  if (opts.includeMetadata) {
    if (cat.description) lines.push(`  Description: ${cat.description}`);
    if (cat.keywords && cat.keywords.length) {
      lines.push(`  Keywords: ${cat.keywords.join(", ")}`);
    }
    if (cat.example_entries && cat.example_entries.length) {
      lines.push(`  Example entries: ${cat.example_entries.join(", ")}`);
    }
    if (opts.includeCoOccurring && cat.co_occurring_category_ids && cat.co_occurring_category_ids.length) {
      const names = cat.co_occurring_category_ids
        .map((id) => catNameById.get(id))
        .filter((n): n is string => !!n);
      if (names.length) {
        lines.push(`  Frequently paired with: ${names.join(", ")}`);
      }
    }
  }

  lines.push(`  Entries:`);
  if (entries.length === 0) {
    lines.push(`    (no entries yet)`);
  } else {
    for (const e of entries) {
      lines.push(`    - "${e.raw_name}" (id: ${e.id})`);
    }
  }
  return lines.join("\n");
}

export function buildOntologyBlock(
  categories: OntoCategory[],
  entries: OntoEntry[],
  options: BuildOntologyBlockOptions = {},
): string {
  const opts: Required<BuildOntologyBlockOptions> = {
    includeMetadata: options.includeMetadata ?? true,
    includeCoOccurring: options.includeCoOccurring ?? true,
    groupByType: options.groupByType ?? true,
  };

  const entriesByCat = new Map<string, OntoEntry[]>();
  for (const e of entries) {
    if (!entriesByCat.has(e.category_id)) entriesByCat.set(e.category_id, []);
    entriesByCat.get(e.category_id)!.push(e);
  }

  const catNameById = new Map<string, string>();
  for (const c of categories) catNameById.set(c.id, c.normalized_name);

  if (!opts.groupByType) {
    return categories
      .map((c) => renderCategory(c, entriesByCat.get(c.id) ?? [], catNameById, opts))
      .join("\n\n");
  }

  const byType = new Map<string, OntoCategory[]>();
  for (const c of categories) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type)!.push(c);
  }

  const orderedTypes = [
    ...TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)),
  ];

  const sections: string[] = [];
  for (const t of orderedTypes) {
    const label = TYPE_LABELS[t] ?? t.toUpperCase();
    const cats = byType.get(t)!;
    const body = cats
      .map((c) => renderCategory(c, entriesByCat.get(c.id) ?? [], catNameById, opts))
      .join("\n\n");
    sections.push(`${label}:\n${body}`);
  }
  return sections.join("\n\n");
}
