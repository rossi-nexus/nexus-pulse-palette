// Profile Queue Part 2 / Prompt 2 — shared, write-free registry refresh dialog.
//
// Wraps the proven enrich-from-registry edge function and presents a side-by-side
// diff (current vs registry) per identity field. Consumer supplies the current
// values and an onApply callback — this component never writes to the DB itself.
// That lets it serve four very different surfaces (DB-side edit toolbar, the
// Verification dialog, the Merge dialog, and the Onboarding wizard) without
// the surface-specific persistence layer leaking in.
//
// Country-aware: if `country` maps to BRREG / CVR / PRH the registry is preset;
// otherwise the consultant picks. Org number is preferred; legal_name fuzzy
// fallback is delegated to the existing edge function in `name` mode.

import { useEffect, useState } from "react";
import { Loader2, Building2, Check, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  REGISTRIES,
  getRegistryByCountry,
  type RegistryId,
} from "@/config/registries";

export type RegistryDiffField =
  | "legal_name"
  | "org_number"
  | "street_address"
  | "city"
  | "region"
  | "country"
  | "actor_website";

const FIELD_LABEL: Record<RegistryDiffField, string> = {
  legal_name: "Legal name",
  org_number: "Org number",
  street_address: "Street address",
  city: "City",
  region: "Region",
  country: "Country",
  actor_website: "Website",
};

const FIELD_ORDER: RegistryDiffField[] = [
  "legal_name",
  "org_number",
  "street_address",
  "city",
  "region",
  "country",
  "actor_website",
];

export interface RegistryIdentity {
  legal_name: string | null;
  org_number: string | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  actor_website: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current values displayed on the "before" side of the diff. */
  current: RegistryIdentity;
  /** Per-field apply callback — does NOT persist; consumer threads to draft state. */
  onApply: (field: RegistryDiffField, value: string) => void;
  /** Optional title override (e.g. "Refresh source from registry" inside merge dialog). */
  title?: string;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function fieldsEqual(f: RegistryDiffField, a: string | null, b: string | null) {
  if (!a && !b) return true;
  if (f === "org_number") return (a ?? "").replace(/\D/g, "") === (b ?? "").replace(/\D/g, "");
  return norm(a) === norm(b);
}

// Edge-function proposal uses `actor_name`; map to our diff shape (legal_name).
function fromProposal(p: Record<string, unknown> | null | undefined): RegistryIdentity | null {
  if (!p) return null;
  const get = (k: string) => {
    const v = p[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    legal_name: get("actor_name"),
    org_number: get("org_number_display") ?? get("org_number"),
    street_address: get("street_address"),
    city: get("city"),
    region: get("region"),
    country: get("country"),
    actor_website: get("actor_website"),
  };
}

export function RegistryRefreshDialog({
  open,
  onOpenChange,
  current,
  onApply,
  title,
}: Props) {
  const initialRegistry = getRegistryByCountry(current.country)?.id ?? null;
  const [registryId, setRegistryId] = useState<RegistryId | "">(initialRegistry ?? "");
  const [orgInput, setOrgInput] = useState<string>(current.org_number ?? "");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<RegistryIdentity | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<RegistryDiffField>>(new Set());

  // Reset when re-opened or current changes.
  useEffect(() => {
    if (open) {
      setRegistryId(getRegistryByCountry(current.country)?.id ?? "");
      setOrgInput(current.org_number ?? "");
      setProposal(null);
      setSourceUrl(null);
      setResolved(new Set());
    }
  }, [open, current.country, current.org_number]);

  const runLookup = async () => {
    if (!registryId) {
      toast.error("Pick a registry first.");
      return;
    }
    setBusy(true);
    setProposal(null);
    setResolved(new Set());
    try {
      const body =
        orgInput.trim().length > 0
          ? { mode: "org_number" as const, org_number: orgInput.trim(), registry: registryId }
          : current.legal_name?.trim()
            ? { mode: "name" as const, name: current.legal_name.trim(), registry: registryId }
            : null;
      if (!body) {
        toast.error("Provide an org number or set the actor's legal name first.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("enrich-from-registry", { body });
      if (error) throw new Error(error.message);
      if (data?.mode === "candidates") {
        // Name search returned a candidate list — surface a hint and pick the top match.
        const first = Array.isArray(data.candidates) ? data.candidates[0] : null;
        if (!first) {
          toast.error("No registry candidates matched.");
          return;
        }
        const lookup = await supabase.functions.invoke("enrich-from-registry", {
          body: { mode: "org_number", org_number: first.org_number, registry: registryId },
        });
        if (lookup.error) throw new Error(lookup.error.message);
        const p = fromProposal(lookup.data?.proposal as Record<string, unknown> | undefined);
        if (!p) throw new Error("Empty registry response.");
        setProposal(p);
        setSourceUrl(lookup.data?.source?.source_url ?? null);
        return;
      }
      const p = fromProposal(data?.proposal as Record<string, unknown> | undefined);
      if (!p) throw new Error("Empty registry response.");
      setProposal(p);
      setSourceUrl(data?.source?.source_url ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registry lookup failed");
    } finally {
      setBusy(false);
    }
  };

  const applyOne = (f: RegistryDiffField) => {
    if (!proposal) return;
    const v = proposal[f];
    if (!v) return;
    onApply(f, v);
    setResolved((prev) => new Set(prev).add(f));
  };

  const applyAll = () => {
    if (!proposal) return;
    const pending = FIELD_ORDER.filter(
      (f) =>
        !resolved.has(f) &&
        proposal[f] &&
        !fieldsEqual(f, current[f], proposal[f]),
    );
    if (pending.length === 0) return;
    pending.forEach((f) => onApply(f, proposal[f] as string));
    setResolved((prev) => {
      const next = new Set(prev);
      pending.forEach((f) => next.add(f));
      return next;
    });
  };

  const changedCount = proposal
    ? FIELD_ORDER.filter(
        (f) => proposal[f] && !fieldsEqual(f, current[f], proposal[f]),
      ).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-2xl bg-elevated border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> {title ?? "Refresh from registry"}
          </DialogTitle>
          <DialogDescription>
            Pull the latest identity values from the relevant national company registry. Nothing
            is overwritten automatically — review each field and apply individually.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-foreground-muted">
              Registry
            </Label>
            <Select
              value={registryId || undefined}
              onValueChange={(v) => setRegistryId(v as RegistryId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick registry…" />
              </SelectTrigger>
              <SelectContent>
                {REGISTRIES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-foreground-muted">
              Org number
            </Label>
            <Input
              value={orgInput}
              onChange={(e) => setOrgInput(e.target.value)}
              placeholder="e.g. 989138671"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && registryId) runLookup();
              }}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={runLookup} disabled={busy || !registryId}>
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Looking up…
              </>
            ) : proposal ? (
              "Re-run lookup"
            ) : (
              "Look up"
            )}
          </Button>
        </div>

        {proposal && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-foreground-muted">
                {changedCount > 0
                  ? `${changedCount} field(s) differ from current values.`
                  : "All registry values match current values."}
                {sourceUrl && (
                  <>
                    {" "}
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-teal hover:underline"
                    >
                      Source
                    </a>
                  </>
                )}
              </div>
              {changedCount > 0 && (
                <Button size="sm" variant="outline" onClick={applyAll}>
                  Apply all
                </Button>
              )}
            </div>

            <div className="border border-border rounded-md divide-y divide-border">
              {FIELD_ORDER.map((f) => {
                const cur = current[f];
                const next = proposal[f];
                const same = fieldsEqual(f, cur, next);
                const isResolved = resolved.has(f);
                return (
                  <div
                    key={f}
                    className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                        {FIELD_LABEL[f]}
                      </div>
                      <div className="truncate text-foreground-secondary">
                        {cur || <span className="text-foreground-muted">(empty)</span>}
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-foreground-muted" />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                        Registry
                      </div>
                      <div
                        className={`truncate ${
                          same ? "text-foreground-muted" : "text-foreground font-medium"
                        }`}
                      >
                        {next || <span className="text-foreground-muted">(empty)</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!next || same ? (
                        <span className="text-[11px] text-foreground-muted">—</span>
                      ) : isResolved ? (
                        <span className="inline-flex items-center text-[11px] text-success">
                          <Check className="w-3 h-3 mr-1" /> Applied
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => applyOne(f)}>
                          Apply
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
