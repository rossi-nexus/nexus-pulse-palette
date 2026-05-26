/**
 * Ontology entry list with click-to-expand metadata.
 *
 * Replaces the bare `TagList` for ontology sections on the actor profile.
 * Behavior:
 *   - Renders chips (visual parity with TagList).
 *   - "+N more" overflow with show less, independent of metadata expand.
 *   - Click a chip → metadata panel renders inline below the row.
 *   - Only one chip expanded at a time per list.
 *   - Click the same chip (or its X) to collapse.
 */

import { useState } from "react";
import {
  X as XIcon,
  ExternalLink,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SOURCE_LABEL,
  type EnrichmentAcceptedItem,
} from "@/types/enrichment";
import type { DisplayEntry } from "@/lib/readOntologyEntries";

const CONFIDENCE_BADGE: Record<NonNullable<EnrichmentAcceptedItem["confidence"]>, string> = {
  high: "bg-success/15 text-success border-success/30",
  medium: "bg-info/15 text-info border-info/30",
  low: "bg-warning/15 text-warning border-warning/30",
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

interface MetadataPanelProps {
  entry: DisplayEntry;
  onClose: () => void;
}

function MetadataPanel({ entry, onClose }: MetadataPanelProps) {
  const meta = entry.meta;
  return (
    <div className="mt-3 bg-surface border border-border-accent/40 rounded-md p-3 text-xs">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{entry.name}</span>
          {meta && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-elevated border border-border/60 text-[10px] uppercase tracking-wider text-foreground-secondary">
              {SOURCE_LABEL[meta.source]}
            </span>
          )}
          {meta?.confidence && (
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider",
                CONFIDENCE_BADGE[meta.confidence],
              )}
            >
              {meta.confidence}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close metadata"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-foreground-muted hover:text-foreground transition-colors shrink-0"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </div>

      {!meta && (
        <div className="flex items-center gap-1.5 text-foreground-muted">
          <Info className="w-3 h-3" />
          <span>Source: unknown — older item without metadata.</span>
        </div>
      )}

      {meta?.evidence && (
        <p className="italic text-foreground-secondary leading-relaxed mb-2 break-words">
          “{meta.evidence}”
        </p>
      )}

      {meta?.description && (
        <p className="text-foreground-secondary leading-relaxed mb-2 break-words">
          {meta.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground-muted">
        {meta?.source_url && (
          <a
            href={meta.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:text-accent-teal transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {hostnameOf(meta.source_url)}
          </a>
        )}
        {meta?.source_description && (
          <span>From: {meta.source_description}</span>
        )}
        {meta?.accepted_at && <span>Added {relativeTime(meta.accepted_at)}</span>}
      </div>
    </div>
  );
}

interface OntologyEntryListProps {
  entries: DisplayEntry[];
}

export function OntologyEntryList({ entries }: OntologyEntryListProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (entries.length === 0) return null;

  const visible = overflowOpen ? entries : entries.slice(0, 5);
  const hiddenCount = entries.length - visible.length;
  // If user collapses overflow while an expanded item is in the hidden tail,
  // collapse the metadata panel to keep state consistent.
  const safeExpandedIdx =
    expandedIdx != null && expandedIdx < visible.length ? expandedIdx : null;
  const expandedEntry =
    safeExpandedIdx != null ? visible[safeExpandedIdx] : null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((entry, i) => {
          const active = i === safeExpandedIdx;
          return (
            <button
              key={`${entry.name}-${i}`}
              type="button"
              onClick={() => setExpandedIdx(active ? null : i)}
              className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-md text-xs border transition-colors text-left",
                active
                  ? "bg-elevated border-border-accent text-foreground"
                  : "bg-surface border-border/60 text-foreground hover:border-border-accent/60",
              )}
              aria-expanded={active}
            >
              {entry.name}
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setOverflowOpen(true)}
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-elevated border border-border/60 text-foreground-secondary hover:text-foreground hover:border-border-accent transition-colors"
          >
            +{hiddenCount} more
          </button>
        )}
        {overflowOpen && entries.length > 5 && (
          <button
            type="button"
            onClick={() => {
              setOverflowOpen(false);
              setExpandedIdx(null);
            }}
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Show less
          </button>
        )}
      </div>
      {expandedEntry && (
        <MetadataPanel
          entry={expandedEntry}
          onClose={() => setExpandedIdx(null)}
        />
      )}
    </div>
  );
}
