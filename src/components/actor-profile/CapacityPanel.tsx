export interface CapacityAttributeRow {
  id: string;
  attribute_type: string;
  value_text: string;
  value_min?: number | null;
  value_max?: number | null;
  unit?: string | null;
  evidence?: string | null;
}

function humanizeType(t: string): string {
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(row: CapacityAttributeRow): string {
  if (row.value_min != null && row.value_max != null) {
    return `${row.value_min}–${row.value_max}${row.unit ? ` ${row.unit}` : ""}`;
  }
  if (row.value_text) {
    return row.unit ? `${row.value_text} ${row.unit}` : row.value_text;
  }
  return "—";
}

export function CapacityPanel({ rows }: { rows: CapacityAttributeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="bg-surface border border-border/60 rounded-md p-3"
          title={r.evidence ?? undefined}
        >
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
            {humanizeType(r.attribute_type)}
          </div>
          <div className="text-sm font-mono text-foreground">{formatValue(r)}</div>
        </div>
      ))}
    </div>
  );
}
