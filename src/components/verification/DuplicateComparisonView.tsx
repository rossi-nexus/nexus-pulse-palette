// Profile Queue Part 2 / P4: side-by-side duplicate comparison view.
// Used during bulk verify (actor mode) and bulk merge (ontology mode).
// Per-field radio picker + inline edit + unified "Result" column. No
// auto-pick: every field is an explicit consultant choice.
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ActorDupCandidate, OntologyDupCandidate } from "@/hooks/useDuplicateScanner";

// ---------- shared ----------

type FieldRow = { key: string; label: string };

interface Column {
  id: string; // "incoming" or actor_id / entry_id
  header: string;
  badge?: string;
  values: Record<string, string | null | undefined>;
}

interface CompareCoreProps {
  columns: Column[];
  rows: FieldRow[];
  defaults?: Record<string, string>; // key -> column.id pre-selected (NOT auto-pick when undefined)
  onResultChange?: (result: Record<string, string>) => void;
}

function CompareCore({ columns, rows, defaults, onResultChange }: CompareCoreProps) {
  const [picks, setPicks] = useState<Record<string, string>>({}); // key -> columnId
  const [edits, setEdits] = useState<Record<string, string>>({}); // key -> manual override
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (defaults) setPicks((p) => ({ ...defaults, ...p }));
  }, [defaults]);

  const result = useMemo(() => {
    const r: Record<string, string> = {};
    for (const row of rows) {
      if (edits[row.key] !== undefined) {
        r[row.key] = edits[row.key];
        continue;
      }
      const col = picks[row.key];
      if (!col) continue;
      const v = columns.find((c) => c.id === col)?.values[row.key];
      r[row.key] = (v ?? "") as string;
    }
    return r;
  }, [picks, edits, columns, rows]);

  useEffect(() => {
    onResultChange?.(result);
  }, [result, onResultChange]);

  return (
    <div className="border border-border rounded overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-elevated">
          <tr>
            <th className="text-left p-2 font-medium text-foreground-muted border-b border-border">Field</th>
            {columns.map((c) => (
              <th key={c.id} className="text-left p-2 font-medium text-foreground border-b border-border min-w-[160px]">
                <div className="flex flex-col gap-0.5">
                  <span>{c.header}</span>
                  {c.badge && <Badge variant="outline" className="text-[9px] w-fit">{c.badge}</Badge>}
                </div>
              </th>
            ))}
            <th className="text-left p-2 font-medium text-success border-b border-border min-w-[180px] border-l border-l-border">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = !!editing[row.key];
            return (
              <tr key={row.key} className="border-b border-border/50 last:border-b-0">
                <td className="p-2 align-top text-foreground-muted whitespace-nowrap">{row.label}</td>
                {columns.map((c) => {
                  const v = c.values[row.key];
                  const isPicked = picks[row.key] === c.id && edits[row.key] === undefined;
                  return (
                    <td key={c.id} className="p-2 align-top">
                      <label className="flex items-start gap-1.5 cursor-pointer group">
                        <input
                          type="radio"
                          name={`pick-${row.key}`}
                          checked={isPicked}
                          onChange={() => {
                            setPicks((p) => ({ ...p, [row.key]: c.id }));
                            setEdits((e) => {
                              const n = { ...e };
                              delete n[row.key];
                              return n;
                            });
                          }}
                          className="mt-0.5 accent-primary"
                        />
                        <span className={`break-words ${isPicked ? "text-foreground" : "text-foreground-muted group-hover:text-foreground"}`}>
                          {v ? String(v) : <span className="italic opacity-60">(empty)</span>}
                        </span>
                      </label>
                    </td>
                  );
                })}
                <td className="p-2 align-top border-l border-border bg-success/5">
                  {isEditing ? (
                    <div className="flex gap-1">
                      <Input
                        autoFocus
                        defaultValue={edits[row.key] ?? result[row.key] ?? ""}
                        onBlur={(e) => {
                          setEdits((prev) => ({ ...prev, [row.key]: e.target.value }));
                          setEditing((prev) => ({ ...prev, [row.key]: false }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditing((p) => ({ ...p, [row.key]: false }));
                        }}
                        className="h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-foreground break-words flex-1">
                        {result[row.key] ? result[row.key] : <span className="italic text-foreground-muted">— pick a column —</span>}
                      </span>
                      <button
                        onClick={() => setEditing((p) => ({ ...p, [row.key]: true }))}
                        className="text-foreground-muted hover:text-foreground shrink-0"
                        title="Edit manually"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- actor mode ----------

export interface ActorComparisonIncoming {
  queue_id: string;
  legal_name: string;
  org_number: string | null;
  country: string | null;
  city: string | null;
  postal_code: string | null;
  street_address: string | null;
}

export type ActorComparisonResolution =
  | { kind: "merge"; survivorActorId: string; values: Record<string, string> }
  | { kind: "new"; values: Record<string, string> }
  | { kind: "skip" };

interface ActorComparisonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incoming: ActorComparisonIncoming;
  candidates: ActorDupCandidate[];
  index: number; // 1-based
  total: number;
  busy?: boolean;
  onResolve: (r: ActorComparisonResolution) => void;
}

const ACTOR_ROWS: FieldRow[] = [
  { key: "legal_name", label: "Legal name" },
  { key: "org_number", label: "Org number" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "postal_code", label: "Postal code" },
  { key: "street_address", label: "Street address" },
  { key: "verification_status", label: "Verification status" },
  { key: "verified_at", label: "Verified at" },
];

export function ActorDuplicateComparison({
  open,
  onOpenChange,
  incoming,
  candidates,
  index,
  total,
  busy,
  onResolve,
}: ActorComparisonProps) {
  const [survivor, setSurvivor] = useState<string>(candidates[0]?.actor_id ?? "");
  const [result, setResult] = useState<Record<string, string>>({});

  const columns: Column[] = useMemo(
    () => [
      {
        id: "incoming",
        header: "Incoming",
        badge: "New",
        values: {
          legal_name: incoming.legal_name,
          org_number: incoming.org_number ?? "",
          country: incoming.country ?? "",
          city: incoming.city ?? "",
          postal_code: incoming.postal_code ?? "",
          street_address: incoming.street_address ?? "",
          verification_status: "unverified",
          verified_at: "",
        },
      },
      ...candidates.map<Column>((c) => ({
        id: c.actor_id,
        header: c.legal_name,
        badge: `${c.match_reason === "org_number" ? "Org# match" : Math.round(c.score * 100) + "%"}`,
        values: {
          legal_name: c.legal_name,
          org_number: c.org_number ?? "",
          country: c.country ?? "",
          city: c.city ?? "",
          postal_code: c.postal_code ?? "",
          street_address: c.street_address ?? "",
          verification_status: c.verification_status,
          verified_at: c.verified_at ?? "",
        },
      })),
    ],
    [incoming, candidates],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate detected — review and resolve</DialogTitle>
          <DialogDescription>
            Resolving {index} of {total} conflicts · pick which column's value lands in each field.
            Every choice is explicit — nothing auto-picked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <CompareCore columns={columns} rows={ACTOR_ROWS} onResultChange={setResult} />

          {candidates.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-foreground-muted">Merge survivor:</span>
              <select
                value={survivor}
                onChange={(e) => setSurvivor(e.target.value)}
                className="h-7 bg-elevated border border-border rounded px-2 text-foreground"
              >
                {candidates.map((c) => (
                  <option key={c.actor_id} value={c.actor_id}>
                    {c.legal_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onResolve({ kind: "skip" })}>
            Skip this one
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onResolve({ kind: "new", values: result })}
          >
            Verify as new actor
          </Button>
          <Button
            disabled={busy || !survivor}
            onClick={() => onResolve({ kind: "merge", survivorActorId: survivor, values: result })}
          >
            Merge with selected duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- ontology mode ----------

export interface OntologyComparisonIncoming {
  entry_id: string;
  raw_name: string;
  description: string | null;
}

export type OntologyComparisonResolution =
  | { kind: "merge"; targetEntryId: string }
  | { kind: "skip" };

interface OntologyComparisonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incoming: OntologyComparisonIncoming;
  candidates: OntologyDupCandidate[];
  index: number;
  total: number;
  busy?: boolean;
  onResolve: (r: OntologyComparisonResolution) => void;
}

const ONT_ROWS: FieldRow[] = [
  { key: "raw_name", label: "Entry name" },
  { key: "description", label: "Description" },
];

export function OntologyDuplicateComparison({
  open,
  onOpenChange,
  incoming,
  candidates,
  index,
  total,
  busy,
  onResolve,
}: OntologyComparisonProps) {
  const [target, setTarget] = useState<string>(candidates[0]?.entry_id ?? "");

  const columns: Column[] = useMemo(
    () => [
      {
        id: "incoming",
        header: "Incoming",
        badge: "New",
        values: { raw_name: incoming.raw_name, description: incoming.description ?? "" },
      },
      ...candidates.map<Column>((c) => ({
        id: c.entry_id,
        header: c.raw_name,
        badge: `${Math.round(c.score * 100)}%`,
        values: { raw_name: c.raw_name, description: c.description ?? "" },
      })),
    ],
    [incoming, candidates],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Duplicate ontology entry — pick merge target</DialogTitle>
          <DialogDescription>
            Resolving {index} of {total} · merging re-points tags to the chosen entry and archives the
            proposed duplicate.
          </DialogDescription>
        </DialogHeader>
        <CompareCore columns={columns} rows={ONT_ROWS} />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-foreground-muted">Merge into:</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-7 bg-elevated border border-border rounded px-2 text-foreground"
          >
            {candidates.map((c) => (
              <option key={c.entry_id} value={c.entry_id}>
                {c.raw_name}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onResolve({ kind: "skip" })}>
            Skip
          </Button>
          <Button
            disabled={busy || !target}
            onClick={() => onResolve({ kind: "merge", targetEntryId: target })}
          >
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
