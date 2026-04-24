import { useState, type KeyboardEvent } from "react";
import {
  Loader2,
  X as XIcon,
  Check,
  Building2,
  ChevronRight,
  ArrowLeft,
  Search,
  Hash,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  REGISTRIES,
  getRegistryById,
  getRegistryByCountry,
  type RegistryId,
  type RegistryInfo,
} from "@/config/registries";

type LookupMode = "org_number" | "name";

interface Candidate {
  actor_name: string;
  org_number: string;
  org_number_display?: string;
  city?: string | null;
  organisasjonsform?: string | null;
}

interface Proposal {
  actor_name: string | null;
  org_number: string | null;
  org_number_display?: string | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  actor_website: string | null;
}

type ProposableField =
  | "actor_name"
  | "org_number"
  | "street_address"
  | "city"
  | "region"
  | "country"
  | "actor_website";

const FIELD_LABEL: Record<ProposableField, string> = {
  actor_name: "Legal name",
  org_number: "Org number",
  street_address: "Street address",
  city: "City",
  region: "Region",
  country: "Country",
  actor_website: "Website",
};

const FIELD_ORDER: ProposableField[] = [
  "actor_name",
  "org_number",
  "street_address",
  "city",
  "region",
  "country",
  "actor_website",
];

type PanelState =
  | { kind: "registry_picker" }
  | { kind: "mode_select"; registryId: RegistryId }
  | { kind: "input"; registryId: RegistryId; mode: LookupMode }
  | { kind: "fetching"; registryId: RegistryId; mode: LookupMode }
  | {
      kind: "candidates";
      registryId: RegistryId;
      candidates: Candidate[];
      totalHits: number;
      query: string;
    }
  | {
      kind: "reviewing";
      registryId: RegistryId;
      proposal: Proposal;
      sourceUrl: string;
    }
  | { kind: "done"; accepted: number; skipped: number }
  | { kind: "error"; message: string; previous?: PanelState };

interface RegistryEnrichmentPanelProps {
  actorId: string;
  currentIdentity: {
    actor_name: string | null;
    org_number: string | null;
    street_address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    actor_website: string | null;
  };
  onClose: () => void;
  onFieldAccepted: (field: ProposableField, value: string | null) => void;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function valuesMatch(
  field: ProposableField,
  current: string | null,
  proposed: string | null,
): boolean {
  if (!current && !proposed) return true;
  if (field === "org_number") {
    return (current ?? "").replace(/\D/g, "") === (proposed ?? "").replace(/\D/g, "");
  }
  return normalize(current) === normalize(proposed);
}

function displayValue(
  field: ProposableField,
  value: string | null,
  proposalDisplay?: string | null,
): string {
  if (!value) return "(empty)";
  if (field === "org_number" && proposalDisplay) return proposalDisplay;
  return value;
}

function getStateRegistryId(state: PanelState): RegistryId | null {
  if (
    state.kind === "mode_select" ||
    state.kind === "input" ||
    state.kind === "fetching" ||
    state.kind === "candidates" ||
    state.kind === "reviewing"
  ) {
    return state.registryId;
  }
  return null;
}

export const RegistryEnrichmentPanel = ({
  actorId,
  currentIdentity,
  onClose,
  onFieldAccepted,
}: RegistryEnrichmentPanelProps) => {
  // Initial state: auto-route by country, else show picker
  const [state, setState] = useState<PanelState>(() => {
    const matched = getRegistryByCountry(currentIdentity.country);
    return matched
      ? { kind: "mode_select", registryId: matched.id }
      : { kind: "registry_picker" };
  });
  const [orgInput, setOrgInput] = useState("");
  const [nameInput, setNameInput] = useState<string>(
    () => currentIdentity.actor_name?.trim() ?? "",
  );
  const [acceptingField, setAcceptingField] = useState<ProposableField | null>(null);
  const [bulkAccepting, setBulkAccepting] = useState(false);

  const [resolvedFields, setResolvedFields] = useState<Set<ProposableField>>(
    new Set(),
  );
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const [localCurrent, setLocalCurrent] = useState(currentIdentity);

  const activeRegistryId = getStateRegistryId(state);
  const activeRegistry: RegistryInfo | null = activeRegistryId
    ? getRegistryById(activeRegistryId)
    : null;

  const callRegistry = async (
    body:
      | { mode: "org_number"; org_number: string }
      | { mode: "name"; name: string },
    registryId: RegistryId,
  ) => {
    const { data, error } = await supabase.functions.invoke(
      "enrich-from-registry",
      { body: { ...body, registry: registryId } },
    );
    if (error) {
      let msg = error.message;
      const ctx = (error as { context?: Response }).context;
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
    return data;
  };

  const lookupByOrgNumber = async (orgNumber: string, registryId: RegistryId) => {
    const reg = getRegistryById(registryId);
    const expectedDigits = reg?.orgNumberDigits ?? 9;
    const digits = orgNumber.replace(/\D/g, "");
    if (digits.length !== expectedDigits) {
      setState({
        kind: "error",
        message:
          reg?.orgNumberHint ??
          `Org numbers must be exactly ${expectedDigits} digits.`,
        previous: { kind: "input", registryId, mode: "org_number" },
      });
      return;
    }
    setState({ kind: "fetching", registryId, mode: "org_number" });
    try {
      const data = await callRegistry(
        { mode: "org_number", org_number: digits },
        registryId,
      );
      if (data?.mode !== "single" || !data?.proposal) {
        throw new Error("Unexpected response from registry.");
      }
      setResolvedFields(new Set());
      setAcceptedCount(0);
      setSkippedCount(0);
      setState({
        kind: "reviewing",
        registryId,
        proposal: data.proposal as Proposal,
        sourceUrl: data.source?.source_url ?? "",
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Registry lookup failed.",
        previous: { kind: "input", registryId, mode: "org_number" },
      });
    }
  };

  const lookupByName = async (name: string, registryId: RegistryId) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setState({
        kind: "error",
        message: "Name must be at least 2 characters.",
        previous: { kind: "input", registryId, mode: "name" },
      });
      return;
    }
    setState({ kind: "fetching", registryId, mode: "name" });
    try {
      const data = await callRegistry({ mode: "name", name: trimmed }, registryId);
      if (data?.mode !== "candidates") {
        throw new Error("Unexpected response from registry.");
      }
      setState({
        kind: "candidates",
        registryId,
        candidates: (data.candidates ?? []) as Candidate[],
        totalHits: typeof data.total_hits === "number" ? data.total_hits : 0,
        query: trimmed,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Registry lookup failed.",
        previous: { kind: "input", registryId, mode: "name" },
      });
    }
  };

  const selectCandidate = async (candidate: Candidate, registryId: RegistryId) => {
    await lookupByOrgNumber(candidate.org_number, registryId);
  };

  const acceptField = async (
    field: ProposableField,
    proposal: Proposal,
  ): Promise<void> => {
    const value = proposal[field] as string | null;
    if (!value) return;
    const update: Record<string, unknown> = { [field]: value };
    const { error } = await supabase
      .from("user_personal_actors")
      .update(update as never)
      .eq("id", actorId);
    if (error) throw new Error(error.message);

    onFieldAccepted(field, value);
    setLocalCurrent((prev) => ({ ...prev, [field]: value }));
    setResolvedFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    setAcceptedCount((c) => c + 1);
  };

  const handleAcceptOne = async (field: ProposableField, proposal: Proposal) => {
    setAcceptingField(field);
    try {
      await acceptField(field, proposal);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept field");
    } finally {
      setAcceptingField(null);
    }
  };

  const handleKeepCurrent = (field: ProposableField) => {
    setResolvedFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    setSkippedCount((c) => c + 1);
  };

  const handleAcceptAll = async (proposal: Proposal) => {
    const pending: ProposableField[] = FIELD_ORDER.filter((f) => {
      if (resolvedFields.has(f)) return false;
      const proposed = proposal[f] as string | null;
      const current = localCurrent[f];
      if (!proposed) return false;
      if (valuesMatch(f, current, proposed)) return false;
      return true;
    });
    if (pending.length === 0) return;
    setBulkAccepting(true);
    try {
      for (const field of pending) {
        await acceptField(field, proposal);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed during accept all");
    } finally {
      setBulkAccepting(false);
    }
  };

  const handleKeepAll = (proposal: Proposal) => {
    const pending = FIELD_ORDER.filter((f) => {
      if (resolvedFields.has(f)) return false;
      const proposed = proposal[f] as string | null;
      const current = localCurrent[f];
      if (!proposed) return false;
      if (valuesMatch(f, current, proposed)) return false;
      return true;
    });
    if (pending.length === 0) return;
    setResolvedFields((prev) => {
      const next = new Set(prev);
      pending.forEach((f) => next.add(f));
      return next;
    });
    setSkippedCount((c) => c + pending.length);
  };

  const finishReview = () => {
    setState({ kind: "done", accepted: acceptedCount, skipped: skippedCount });
  };

  const resetToModeSelect = () => {
    // Within the same registry — preserve inputs.
    setResolvedFields(new Set());
    setAcceptedCount(0);
    setSkippedCount(0);
    if (activeRegistryId) {
      setState({ kind: "mode_select", registryId: activeRegistryId });
    } else {
      setState({ kind: "registry_picker" });
    }
  };

  const resetToRegistryPicker = () => {
    // Full reset — switching registry invalidates cached inputs.
    setOrgInput("");
    setNameInput(currentIdentity.actor_name?.trim() ?? "");
    setResolvedFields(new Set());
    setAcceptedCount(0);
    setSkippedCount(0);
    setState({ kind: "registry_picker" });
  };

  const pickRegistry = (registryId: RegistryId) => {
    setState({ kind: "mode_select", registryId });
  };

  const handleOrgKey = (e: KeyboardEvent<HTMLInputElement>, registryId: RegistryId) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (orgInput.trim()) lookupByOrgNumber(orgInput, registryId);
    }
  };
  const handleNameKey = (e: KeyboardEvent<HTMLInputElement>, registryId: RegistryId) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (nameInput.trim().length >= 2) lookupByName(nameInput, registryId);
    }
  };

  const headerSubtitle = (() => {
    if (state.kind === "input")
      return state.mode === "org_number" ? "Look up by org number" : "Search by name";
    if (state.kind === "fetching")
      return state.mode === "org_number" ? "Looking up by org number…" : "Searching by name…";
    if (state.kind === "candidates")
      return `${state.candidates.length} of ${state.totalHits} for "${state.query}"`;
    if (state.kind === "reviewing") return "Review proposed fields";
    if (state.kind === "done") return "Review complete";
    return null;
  })();

  const headerLabel = activeRegistry
    ? `Registry · ${activeRegistry.name}`
    : "Registry lookup";

  const showChangeRegistry =
    activeRegistryId !== null &&
    (state.kind === "mode_select" ||
      state.kind === "input" ||
      state.kind === "candidates" ||
      state.kind === "reviewing");

  return (
    <div className="mt-4 bg-elevated border border-border rounded-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-secondary">
            {headerLabel}
          </span>
          {showChangeRegistry && (
            <button
              type="button"
              onClick={resetToRegistryPicker}
              className="text-[10px] uppercase tracking-wider text-foreground-muted hover:text-accent-teal transition-colors ml-1"
            >
              Change
            </button>
          )}
          {headerSubtitle && (
            <>
              <ChevronRight className="w-3 h-3 text-foreground-muted shrink-0" />
              <span className="text-xs text-foreground-muted truncate min-w-0">
                {headerSubtitle}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close registry lookup"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-elevated transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        {state.kind === "registry_picker" && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              {currentIdentity.country
                ? `No registry adapter is available for "${currentIdentity.country}". Pick one to search:`
                : "This actor has no country set. Pick a registry to search:"}
            </p>
            <ul className="space-y-2">
              {REGISTRIES.map((reg) => (
                <li key={reg.id}>
                  <button
                    type="button"
                    onClick={() => pickRegistry(reg.id)}
                    className="w-full text-left bg-surface/40 border border-border/60 hover:border-accent-teal/60 rounded-md px-3 py-2 transition-colors"
                  >
                    <div className="text-sm font-medium text-foreground">{reg.name}</div>
                    <div className="text-xs text-foreground-muted mt-0.5">
                      {reg.description}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.kind === "mode_select" && activeRegistry && (
          <div className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              Look up this company in {activeRegistry.name}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setState({
                    kind: "input",
                    registryId: state.registryId,
                    mode: "name",
                  })
                }
              >
                <Search className="w-3.5 h-3.5" /> Search by name
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setState({
                    kind: "input",
                    registryId: state.registryId,
                    mode: "org_number",
                  })
                }
              >
                <Hash className="w-3.5 h-3.5" /> Look up by org number
              </Button>
            </div>
          </div>
        )}

        {state.kind === "input" && activeRegistry && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={resetToModeSelect}
              className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" /> Change lookup mode
            </button>
            {state.mode === "org_number" ? (
              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase tracking-wider text-foreground-muted">
                  Org number ({activeRegistry.orgNumberDigits} digits)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={orgInput}
                    onChange={(e) => setOrgInput(e.target.value)}
                    onKeyDown={(e) => handleOrgKey(e, state.registryId)}
                    placeholder={activeRegistry.orgNumberPlaceholder}
                    inputMode="numeric"
                    className="h-9 text-sm font-mono"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => lookupByOrgNumber(orgInput, state.registryId)}
                    disabled={
                      orgInput.replace(/\D/g, "").length !==
                      activeRegistry.orgNumberDigits
                    }
                  >
                    Fetch
                  </Button>
                </div>
                <p className="text-[10px] text-foreground-muted">
                  {activeRegistry.orgNumberHint}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase tracking-wider text-foreground-muted">
                  Company name
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => handleNameKey(e, state.registryId)}
                    placeholder="Kongsberg Discovery"
                    className="h-9 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => lookupByName(nameInput, state.registryId)}
                    disabled={nameInput.trim().length < 2}
                  >
                    Search
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {state.kind === "fetching" && activeRegistry && (
          <div className="flex items-center gap-2 py-2 text-sm text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />
            <span>Looking up in {activeRegistry.name}…</span>
          </div>
        )}

        {state.kind === "candidates" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-muted">
                {state.candidates.length === 0
                  ? `No results for "${state.query}"`
                  : `${state.totalHits} result${state.totalHits === 1 ? "" : "s"} (showing ${state.candidates.length})`}
              </span>
              <button
                type="button"
                onClick={() =>
                  setState({
                    kind: "input",
                    registryId: state.registryId,
                    mode: "name",
                  })
                }
                className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Refine search
              </button>
            </div>
            {state.candidates.length > 0 && (
              <ul className="space-y-1.5">
                {state.candidates.map((c) => (
                  <li
                    key={c.org_number}
                    className="flex items-center justify-between gap-2 bg-surface/40 border border-border/60 rounded-md px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {c.actor_name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-foreground-muted mt-0.5">
                        <span className="font-mono">
                          {c.org_number_display ?? c.org_number}
                        </span>
                        {c.city && <span>· {c.city}</span>}
                        {c.organisasjonsform && (
                          <span className="uppercase">· {c.organisasjonsform}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 border-accent-teal/40 text-accent-teal hover:bg-accent-teal/10 hover:text-accent-teal"
                      onClick={() => selectCandidate(c, state.registryId)}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.kind === "reviewing" && activeRegistry && (
          <ReviewBody
            registryName={activeRegistry.name}
            proposal={state.proposal}
            sourceUrl={state.sourceUrl}
            localCurrent={localCurrent}
            resolvedFields={resolvedFields}
            acceptingField={acceptingField}
            bulkAccepting={bulkAccepting}
            onAcceptOne={(f) => handleAcceptOne(f, state.proposal)}
            onKeepCurrent={handleKeepCurrent}
            onAcceptAll={() => handleAcceptAll(state.proposal)}
            onKeepAll={() => handleKeepAll(state.proposal)}
            onChangeLookup={resetToModeSelect}
            onFinish={finishReview}
          />
        )}

        {state.kind === "done" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-foreground-secondary">
              {state.accepted} field{state.accepted === 1 ? "" : "s"} updated,{" "}
              {state.skipped} kept current.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={resetToModeSelect}>
                Look up another
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-destructive">{state.message}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setState(
                    state.previous ??
                      (activeRegistryId
                        ? { kind: "mode_select", registryId: activeRegistryId }
                        : { kind: "registry_picker" }),
                  )
                }
              >
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ReviewBodyProps {
  registryName: string;
  proposal: Proposal;
  sourceUrl: string;
  localCurrent: RegistryEnrichmentPanelProps["currentIdentity"];
  resolvedFields: Set<ProposableField>;
  acceptingField: ProposableField | null;
  bulkAccepting: boolean;
  onAcceptOne: (field: ProposableField) => void;
  onKeepCurrent: (field: ProposableField) => void;
  onAcceptAll: () => void;
  onKeepAll: () => void;
  onChangeLookup: () => void;
  onFinish: () => void;
}

function ReviewBody({
  registryName,
  proposal,
  sourceUrl,
  localCurrent,
  resolvedFields,
  acceptingField,
  bulkAccepting,
  onAcceptOne,
  onKeepCurrent,
  onAcceptAll,
  onKeepAll,
  onChangeLookup,
  onFinish,
}: ReviewBodyProps) {
  const orgDisplay = proposal.org_number_display ?? proposal.org_number ?? "";
  const pendingCount = FIELD_ORDER.filter((f) => {
    if (resolvedFields.has(f)) return false;
    const proposed = proposal[f] as string | null;
    if (!proposed) return false;
    if (valuesMatch(f, localCurrent[f], proposed)) return false;
    return true;
  }).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-foreground-muted">
        Proposed from {registryName}
        {orgDisplay && (
          <>
            {" · org "}
            <span className="font-mono text-foreground-secondary">{orgDisplay}</span>
          </>
        )}
      </div>

      <ul className="divide-y divide-border/60 border border-border/60 rounded-md overflow-hidden">
        {FIELD_ORDER.map((field) => {
          const proposed = proposal[field] as string | null;
          const current = localCurrent[field];
          const matches = valuesMatch(field, current, proposed);
          const isResolved = resolvedFields.has(field);
          const proposedEmpty = !proposed;

          return (
            <li key={field} className="px-3 py-2.5 bg-surface/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1">
                    {FIELD_LABEL[field]}
                  </div>
                  <div className="text-xs text-foreground-secondary leading-relaxed">
                    <span className="text-foreground-muted">Current:</span>{" "}
                    <span
                      className={cn(
                        !current && "italic text-foreground-muted",
                      )}
                    >
                      {displayValue(field, current)}
                    </span>
                  </div>
                  <div className="text-xs text-foreground-secondary leading-relaxed mt-0.5">
                    <span className="text-foreground-muted">Proposed:</span>{" "}
                    <span
                      className={cn(
                        proposedEmpty && "italic text-foreground-muted",
                        !proposedEmpty && !matches && !isResolved && "text-foreground font-medium",
                      )}
                    >
                      {proposedEmpty
                        ? "(none)"
                        : displayValue(field, proposed, proposal.org_number_display)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 pt-1">
                  {matches ? (
                    <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      (matches)
                    </span>
                  ) : isResolved ? (
                    <span className="text-[10px] uppercase tracking-wider text-success">
                      Updated
                    </span>
                  ) : proposedEmpty ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => onKeepCurrent(field)}
                      disabled={bulkAccepting}
                    >
                      Keep current
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 border-accent-teal/40 text-accent-teal hover:bg-accent-teal/10 hover:text-accent-teal"
                        onClick={() => onAcceptOne(field)}
                        disabled={acceptingField !== null || bulkAccepting}
                        aria-label={`Accept ${FIELD_LABEL[field]}`}
                      >
                        {acceptingField === field ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => onKeepCurrent(field)}
                        disabled={acceptingField !== null || bulkAccepting}
                        aria-label={`Keep current ${FIELD_LABEL[field]}`}
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={onAcceptAll}
          disabled={bulkAccepting || acceptingField !== null || pendingCount === 0}
        >
          {bulkAccepting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Accept all ({pendingCount})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onKeepAll}
          disabled={bulkAccepting || acceptingField !== null || pendingCount === 0}
        >
          Keep all current
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={onChangeLookup}
          disabled={bulkAccepting || acceptingField !== null}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Change lookup
        </Button>
        <Button
          size="sm"
          onClick={onFinish}
          disabled={bulkAccepting || acceptingField !== null}
        >
          Done
        </Button>
      </div>

      {sourceUrl && (
        <p className="text-[10px] text-foreground-muted truncate">
          Source: <span className="font-mono">{sourceUrl}</span>
        </p>
      )}
    </div>
  );
}
