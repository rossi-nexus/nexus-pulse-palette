import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search, Hash, Info, X as XIcon, ExternalLink, ShieldCheck, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { REGISTRIES, type RegistryId } from "@/config/registries";

interface RegistryProposal {
  actor_name: string | null;
  org_number: string | null;
  org_number_display?: string | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  actor_website: string | null;
  postal_code?: string | null;
  industry_codes?: string[];
  industry_label?: string | null;
  trade_names?: string[];
  founding_date?: string | null;
  employee_count?: number | null;
}

interface Candidate {
  actor_name: string;
  org_number: string;
  org_number_display?: string;
  city?: string | null;
  organisasjonsform?: string | null;
}

type ImportBanner =
  | { kind: "imported"; actor_id: string; queue_id: string; name: string }
  | { kind: "duplicate_actor"; existing_actor_id: string; name: string }
  | { kind: "duplicate_queue"; existing_queue_id: string; name: string }
  | { kind: "error"; message: string };

type Mode = "name" | "org_number";

interface ResultItem {
  proposal: RegistryProposal;
  source_url: string;
}

const RegistryImportPage = () => {
  const [registryId, setRegistryId] = useState<RegistryId>("brreg");
  const [mode, setMode] = useState<Mode>("name");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [results, setResults] = useState<Record<string, ResultItem>>({});
  const [previewing, setPreviewing] = useState<ResultItem | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [banner, setBanner] = useState<ImportBanner | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setCandidates([]);
    setResults({});
    setBanner(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-from-registry",
        {
          body:
            mode === "org_number"
              ? { mode: "org_number", org_number: q, registry: registryId }
              : { mode: "name", name: q, registry: registryId },
        },
      );
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let msg = error.message;
        if (ctx && typeof ctx.json === "function") {
          try {
            const parsed = await ctx.json();
            if (parsed?.error) msg = parsed.error;
          } catch {
            /* ignore */
          }
        }
        throw new Error(msg);
      }
      if (data?.mode === "single" && data.proposal) {
        const proposal = data.proposal as RegistryProposal;
        const item: ResultItem = {
          proposal,
          source_url: data.source?.source_url ?? "",
        };
        const key = proposal.org_number ?? q;
        setCandidates([
          {
            actor_name: proposal.actor_name ?? key,
            org_number: proposal.org_number ?? q,
            org_number_display: proposal.org_number_display ?? undefined,
            city: proposal.city,
          },
        ]);
        setResults({ [key]: item });
      } else if (data?.mode === "candidates") {
        setCandidates((data.candidates ?? []) as Candidate[]);
      } else {
        throw new Error("Unexpected registry response shape");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registry lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const ensureFullRecord = async (orgNumber: string): Promise<ResultItem | null> => {
    if (results[orgNumber]) return results[orgNumber];
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-from-registry",
        {
          body: {
            mode: "org_number",
            org_number: orgNumber,
            registry: registryId,
          },
        },
      );
      if (error) throw new Error(error.message);
      if (data?.mode !== "single" || !data.proposal) {
        throw new Error("Unexpected registry response when fetching detail");
      }
      const item: ResultItem = {
        proposal: data.proposal as RegistryProposal,
        source_url: data.source?.source_url ?? "",
      };
      setResults((prev) => ({ ...prev, [orgNumber]: item }));
      return item;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fetch detail failed");
      return null;
    }
  };

  const handlePreview = async (orgNumber: string) => {
    const item = await ensureFullRecord(orgNumber);
    if (item) setPreviewing(item);
  };

  const handleImport = async (orgNumber: string) => {
    setImporting(orgNumber);
    setBanner(null);
    try {
      const item = await ensureFullRecord(orgNumber);
      if (!item) return;
      const { data, error } = await supabase.rpc("fn_import_actor_from_registry", {
        p_registry: registryId,
        p_external_id: item.proposal.org_number ?? orgNumber,
        p_data: item.proposal as never,
        p_evidence_url: item.source_url || null,
      });
      if (error) throw new Error(error.message);
      const result = data as {
        status: string;
        actor_id?: string;
        queue_id?: string;
        existing_actor_id?: string;
        existing_queue_id?: string;
        message?: string;
      };
      const name = item.proposal.actor_name ?? orgNumber;
      if (result.status === "imported" && result.actor_id && result.queue_id) {
        setBanner({
          kind: "imported",
          actor_id: result.actor_id,
          queue_id: result.queue_id,
          name,
        });
      } else if (result.status === "duplicate_actor" && result.existing_actor_id) {
        setBanner({
          kind: "duplicate_actor",
          existing_actor_id: result.existing_actor_id,
          name,
        });
      } else if (result.status === "duplicate_queue" && result.existing_queue_id) {
        setBanner({
          kind: "duplicate_queue",
          existing_queue_id: result.existing_queue_id,
          name,
        });
      } else {
        setBanner({
          kind: "error",
          message: result.message ?? "Unknown import result",
        });
      }
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Import failed",
      });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full border border-border-accent/60 bg-accent-teal/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
              <ShieldCheck className="w-3 h-3" /> Admin
            </span>
            <h1 className="text-2xl font-semibold text-foreground">
              Registry import
            </h1>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="What this does"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-elevated transition-colors"
                >
                  <Info className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[420px] text-xs text-foreground-secondary space-y-2"
              >
                <p className="font-medium text-foreground">After import:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    A draft actor record is created in the main DB with{" "}
                    <code className="text-[11px]">verified_at = NULL</code>.
                  </li>
                  <li>A verification-queue entry is created.</li>
                  <li>
                    The actor must be opened in the Verification workspace and
                    run through "Complete &amp; verify" before it counts as
                    verified.
                  </li>
                  <li>
                    Duplicate detection runs against existing actors (by org
                    number) and existing pending queue items.
                  </li>
                </ul>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-sm text-foreground-secondary">
            Import organisations from Nordic registries into the verification
            queue. Imported actors land unverified and are completed via the
            verification workspace.
          </p>
        </header>

        <section className="bg-elevated border border-border rounded-md p-4 space-y-4">
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
              Registry
            </span>
            <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
              {REGISTRIES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRegistryId(r.id);
                    setCandidates([]);
                    setResults({});
                    setBanner(null);
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    registryId === r.id
                      ? "bg-elevated text-foreground shadow-sm border border-border-accent/60"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                  aria-pressed={registryId === r.id}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-foreground-secondary">
              Mode
            </span>
            <button
              type="button"
              onClick={() => setMode("name")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs border transition-colors ${
                mode === "name"
                  ? "border-accent-teal text-foreground bg-surface"
                  : "border-border text-foreground-secondary hover:text-foreground"
              }`}
            >
              <Search className="w-3 h-3" />
              Search by name
            </button>
            <button
              type="button"
              onClick={() => setMode("org_number")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs border transition-colors ${
                mode === "org_number"
                  ? "border-accent-teal text-foreground bg-surface"
                  : "border-border text-foreground-secondary hover:text-foreground"
              }`}
            >
              <Hash className="w-3 h-3" />
              Org number
            </button>
          </div>

          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder={
                mode === "name"
                  ? "Organisation name…"
                  : REGISTRIES.find((r) => r.id === registryId)
                      ?.orgNumberPlaceholder ?? "Org number"
              }
              className="flex-1"
            />
            <Button onClick={runSearch} disabled={loading || !query.trim()}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Search"
              )}
            </Button>
          </div>
        </section>

        {banner && (
          <div
            className={`border rounded-md p-3 text-sm ${
              banner.kind === "imported"
                ? "border-accent-green/60 bg-accent-green/10 text-foreground"
                : banner.kind === "error"
                  ? "border-red-500/60 bg-red-500/10 text-foreground"
                  : "border-yellow-500/60 bg-yellow-500/10 text-foreground"
            }`}
          >
            {banner.kind === "imported" && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Imported <strong>{banner.name}</strong>. Actor{" "}
                  <code className="text-xs">{banner.actor_id.slice(0, 8)}</code>{" "}
                  + queue{" "}
                  <code className="text-xs">{banner.queue_id.slice(0, 8)}</code>{" "}
                  created.
                </span>
                <Link
                  to="/consultant/verification"
                  className="inline-flex items-center gap-1 text-accent-teal hover:underline"
                >
                  View in verification queue
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}
            {banner.kind === "duplicate_actor" && (
              <span>
                <strong>{banner.name}</strong> already exists in the main DB
                (actor{" "}
                <code className="text-xs">
                  {banner.existing_actor_id.slice(0, 8)}
                </code>
                ).
              </span>
            )}
            {banner.kind === "duplicate_queue" && (
              <span>
                <strong>{banner.name}</strong> is already in the verification
                queue (item{" "}
                <code className="text-xs">
                  {banner.existing_queue_id.slice(0, 8)}
                </code>
                ).
              </span>
            )}
            {banner.kind === "error" && (
              <span>Import failed: {banner.message}</span>
            )}
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded text-foreground-muted hover:text-foreground float-right"
              aria-label="Dismiss"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {candidates.length > 0 && (
          <section className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-foreground-secondary">
              Results
            </div>
            {candidates.map((c) => {
              const key = c.org_number;
              const detail = results[key];
              return (
                <div
                  key={key}
                  className="bg-elevated border border-border rounded-md p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">
                      {c.actor_name}
                    </span>
                    <span className="text-xs text-foreground-muted">
                      {c.org_number_display ?? c.org_number}
                    </span>
                    {c.city && (
                      <span className="text-xs text-foreground-muted">
                        · {c.city}
                      </span>
                    )}
                  </div>
                  {detail && (
                    <div className="text-xs text-foreground-secondary space-y-0.5">
                      {detail.proposal.industry_label && (
                        <div>
                          industry: {detail.proposal.industry_label}
                          {detail.proposal.industry_codes?.length
                            ? ` (${detail.proposal.industry_codes.join(", ")})`
                            : ""}
                        </div>
                      )}
                      {detail.proposal.founding_date && (
                        <div>founded: {detail.proposal.founding_date}</div>
                      )}
                      {detail.proposal.employee_count != null && (
                        <div>employees: {detail.proposal.employee_count}</div>
                      )}
                      {detail.proposal.actor_website && (
                        <div>website: {detail.proposal.actor_website}</div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(key)}
                    >
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleImport(key)}
                      disabled={importing === key}
                    >
                      {importing === key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Import to queue"
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {!loading && candidates.length === 0 && query && (
          <div className="text-xs text-foreground-muted">No results yet. Try a search.</div>
        )}
      </div>

      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Proposal preview ·{" "}
              {previewing?.proposal.actor_name ?? "Unknown"}
            </DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-surface border border-border rounded p-3 overflow-auto max-h-[60vh]">
            {previewing ? JSON.stringify(previewing.proposal, null, 2) : ""}
          </pre>
          {previewing?.source_url && (
            <a
              href={previewing.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-accent-teal hover:underline inline-flex items-center gap-1"
            >
              Source: {previewing.source_url}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegistryImportPage;
