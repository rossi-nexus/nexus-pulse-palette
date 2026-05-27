// Profile-7: admin-only Merge actors dialog.
// Survivor = current actor (fixed). Source = picked from search results.
// Confirms then calls fn_merge_actors RPC.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, GitMerge, AlertTriangle, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { similarity } from "@/lib/fuzzyMatch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getRegistryByCountry } from "@/config/registries";

interface Candidate {
  id: string;
  legal_name: string;
  org_number: string | null;
  country: string | null;
  city: string | null;
  verified_at: string | null;
  score: number;
}

interface Survivor {
  id: string;
  legal_name: string;
  org_number: string | null;
  country: string | null;
  city: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  survivor: Survivor;
  onMerged: () => void;
}

export function MergeActorsDialog({ open, onOpenChange, survivor, onMerged }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [reason, setReason] = useState("");
  const [merging, setMerging] = useState(false);
  // Part 2 / Prompt 2: live registry snapshots displayed under each side once
  // the consultant clicks "Refresh both from registry". Informational only.
  const [registryBusy, setRegistryBusy] = useState(false);
  const [survivorFresh, setSurvivorFresh] = useState<RegistrySnapshot | null>(null);
  const [pickedFresh, setPickedFresh] = useState<RegistrySnapshot | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery(survivor.legal_name);
      setPicked(null);
      setReason("");
      setResults([]);
    }
  }, [open, survivor.legal_name]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const orgNum = q.replace(/\s+/g, "");
        const { data, error } = await supabase
          .from("actors")
          .select("id, legal_name, org_number, country, city, verified_at, verification_status")
          .neq("id", survivor.id)
          .neq("verification_status", "merged_into_other")
          .or(`legal_name.ilike.%${q}%,org_number.eq.${orgNum}`)
          .limit(40);
        if (error) throw error;
        const scored: Candidate[] = (data ?? []).map((r: any) => ({
          id: r.id,
          legal_name: r.legal_name,
          org_number: r.org_number,
          country: r.country,
          city: r.city,
          verified_at: r.verified_at,
          score:
            r.org_number && r.org_number === orgNum
              ? 1
              : similarity(r.legal_name ?? "", q),
        }));
        scored.sort((a, b) => b.score - a.score);
        setResults(scored.slice(0, 10));
      } catch (e: any) {
        toast.error(`Search failed: ${e?.message ?? "unknown"}`);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, survivor.id]);

  const handleMerge = async () => {
    if (!picked) return;
    setMerging(true);
    try {
      const { error } = await supabase.rpc("fn_merge_actors", {
        p_survivor_id: survivor.id,
        p_source_id: picked.id,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success("Actor merged");
      onMerged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !merging && onOpenChange(v)}>
      <DialogContent className="max-w-2xl bg-elevated border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-4 h-4" /> Merge duplicate actor
          </DialogTitle>
          <DialogDescription>
            Pick the duplicate to merge <span className="font-medium text-foreground">into</span>{" "}
            <span className="font-mono text-foreground">{survivor.legal_name}</span>. All tags,
            contacts, satellite data, and references move to the survivor. The source is archived
            and cannot be restored.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-foreground-muted" />
              <Input
                autoFocus
                placeholder="Search by legal name or org number…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="border border-border rounded-md max-h-[320px] overflow-auto">
              {searching ? (
                <div className="p-6 text-center text-sm text-foreground-muted">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="p-6 text-center text-sm text-foreground-muted">
                  {query.trim().length < 2 ? "Type to search candidates" : "No matches"}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(r)}
                        className="w-full text-left p-3 hover:bg-surface transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-foreground">{r.legal_name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {(r.score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="text-xs text-foreground-muted flex flex-wrap gap-x-3">
                          {r.org_number && <span>Org: {r.org_number}</span>}
                          {r.city && <span>{r.city}</span>}
                          {r.country && <span>{r.country}</span>}
                          {r.verified_at && (
                            <span>Verified {new Date(r.verified_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                Merging{" "}
                <span className="font-mono font-medium text-foreground">{picked.legal_name}</span>{" "}
                into{" "}
                <span className="font-mono font-medium text-foreground">
                  {survivor.legal_name}
                </span>
                . All tags, contacts, capacity, audit events, and references move to the survivor.
                The source row is archived. This cannot be undone.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="border border-border rounded-md p-3 bg-surface">
                <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                  Survivor (keeps)
                </div>
                <div className="font-medium text-foreground">{survivor.legal_name}</div>
                <div className="text-xs text-foreground-muted mt-0.5">
                  {[survivor.org_number, survivor.city, survivor.country].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="border border-border rounded-md p-3 bg-surface opacity-70">
                <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                  Source (archived)
                </div>
                <div className="font-medium text-foreground line-through">{picked.legal_name}</div>
                <div className="text-xs text-foreground-muted mt-0.5">
                  {[picked.org_number, picked.city, picked.country].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-foreground-muted mb-1 block">
                Reason (optional)
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are these duplicates?"
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {picked && (
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)} disabled={merging}>
              Back
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={merging}
          >
            Cancel
          </Button>
          {picked && (
            <Button size="sm" onClick={handleMerge} disabled={merging}>
              {merging ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Merging…
                </>
              ) : (
                <>
                  <GitMerge className="w-3.5 h-3.5 mr-1.5" /> Confirm merge
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
