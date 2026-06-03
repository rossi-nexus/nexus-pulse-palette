// V3 Batch B.2 — Address Discovery Dialog.
// Three primary discovery paths (registry / website / manual) → confirm step
// that pre-fills the address fields → save to actors.* with appropriate
// `source` so ProvenanceBadge renders the right state.
import { useEffect, useState } from "react";
import { Loader2, Building2, Globe, Pencil, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AddressFields {
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actorId: string;
  actorName: string;
  orgNumber: string | null;
  website: string | null;
  country: string | null;
  onSaved: () => void;
}

type Step = "choose" | "loading" | "pick" | "confirm";
type DiscoverySource = "registry" | "auto_enrichment" | "manual";

interface WebsiteCandidate extends AddressFields {
  raw_text: string;
  matched_path: string;
  source_url: string;
}

const AddressDiscoveryDialog = ({
  open,
  onClose,
  actorId,
  actorName,
  orgNumber,
  website,
  country,
  onSaved,
}: Props) => {
  const [step, setStep] = useState<Step>("choose");
  const [draft, setDraft] = useState<AddressFields>({
    street_address: null,
    postal_code: null,
    city: null,
    region: null,
    country: country ?? null,
  });
  const [source, setSource] = useState<DiscoverySource>("manual");
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<WebsiteCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("choose");
      setBusy(false);
      setCandidates([]);
      setDiagnostics(null);
      setSourceLabel(null);
      setDraft({
        street_address: null,
        postal_code: null,
        city: null,
        region: null,
        country: country ?? null,
      });
    }
  }, [open, country]);

  const discoverFromRegistry = async () => {
    if (!orgNumber) {
      toast.error("No org number on file.");
      return;
    }
    setBusy(true);
    setStep("loading");
    try {
      const { data, error } = await supabase.functions.invoke("enrich-from-registry", {
        body: {
          mode: "org_number",
          org_number: orgNumber,
          actor_context: { country },
        },
      });
      if (error) throw new Error(error.message);
      const payload = data as any;
      if (payload?.error) throw new Error(payload.error);
      const addr: AddressFields = {
        street_address: payload?.street_address ?? null,
        postal_code: payload?.postal_code ?? null,
        city: payload?.city ?? null,
        region: payload?.region ?? null,
        country: payload?.country ?? country ?? null,
      };
      if (!addr.street_address && !addr.city) {
        throw new Error("Registry returned no address fields.");
      }
      setDraft(addr);
      setSource("registry");
      setSourceLabel(`From BRREG · ${new Date().toLocaleDateString()}`);
      setStep("confirm");
    } catch (e: any) {
      toast.error(`Registry lookup failed: ${e?.message ?? "unknown"}`);
      setStep("choose");
    } finally {
      setBusy(false);
    }
  };

  const discoverFromWebsite = async () => {
    if (!website) {
      toast.error("No website on file.");
      return;
    }
    setBusy(true);
    setStep("loading");
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-address-from-website",
        { body: { website } },
      );
      if (error) throw new Error(error.message);
      const payload = data as any;
      if (payload?.error) throw new Error(payload.error);
      const list: WebsiteCandidate[] = payload?.candidates ?? [];
      const diag: { path: string; hits: number; status: string }[] = payload?.diagnostics ?? [];
      const diagSummary = diag
        .filter((d) => d.hits > 0)
        .map((d) => `${d.path} (${d.hits})`)
        .join(", ");
      setDiagnostics(diagSummary || "no matches");
      if (list.length === 0) {
        toast.error("Couldn't find an address on the website.");
        setStep("choose");
        return;
      }
      if (list.length === 1) {
        setDraft({
          street_address: list[0].street_address,
          postal_code: list[0].postal_code,
          city: list[0].city,
          region: list[0].region,
          country: list[0].country ?? country ?? null,
        });
        setSource("auto_enrichment");
        setSourceLabel(`From website · ${list[0].matched_path}`);
        setStep("confirm");
      } else {
        setCandidates(list);
        setStep("pick");
      }
    } catch (e: any) {
      toast.error(`Website discovery failed: ${e?.message ?? "unknown"}`);
      setStep("choose");
    } finally {
      setBusy(false);
    }
  };

  const enterManually = () => {
    setSource("manual");
    setSourceLabel("Entered manually");
    setStep("confirm");
  };

  const pickCandidate = (c: WebsiteCandidate) => {
    setDraft({
      street_address: c.street_address,
      postal_code: c.postal_code,
      city: c.city,
      region: c.region,
      country: c.country ?? country ?? null,
    });
    setSource("auto_enrichment");
    setSourceLabel(`From website · ${c.matched_path}`);
    setStep("confirm");
  };

  const save = async () => {
    if (!draft.street_address && !draft.city) {
      toast.error("Address must include at least a street or city.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("actors")
      .update({
        street_address: draft.street_address,
        postal_code: draft.postal_code,
        city: draft.city,
        region: draft.region,
        country: draft.country,
        source,
      })
      .eq("id", actorId);
    setBusy(false);
    if (error) {
      toast.error(`Could not save address: ${error.message}`);
      return;
    }
    toast.success("Address saved");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl bg-elevated border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Add address for {actorName}
          </DialogTitle>
        </DialogHeader>

        {step === "choose" && (
          <div className="space-y-3">
            <OptionCard
              icon={Building2}
              title="Discover from registry"
              subtitle={
                orgNumber
                  ? `Look up ${orgNumber} in the official business registry.`
                  : "No org number on file — add one first."
              }
              disabled={!orgNumber}
              onClick={discoverFromRegistry}
            />
            <OptionCard
              icon={Globe}
              title="Discover from website"
              subtitle={
                website
                  ? `Scan ${website.replace(/^https?:\/\//, "")} for a postal address.`
                  : "No website on file — add one first."
              }
              disabled={!website}
              onClick={discoverFromWebsite}
            />
            <OptionCard
              icon={Pencil}
              title="Enter manually"
              subtitle="Type the address yourself."
              onClick={enterManually}
            />
          </div>
        )}

        {step === "loading" && (
          <div className="flex items-center justify-center py-12 text-foreground-muted text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Discovering address…
          </div>
        )}

        {step === "pick" && (
          <div className="space-y-2">
            <p className="text-xs text-foreground-muted">
              The website returned several candidates. Pick the best one:
            </p>
            {candidates.map((c, i) => (
              <button
                key={`${c.raw_text}-${i}`}
                type="button"
                onClick={() => pickCandidate(c)}
                className="w-full text-left px-3 py-2 rounded-md border border-border bg-surface hover:border-border-accent transition-colors"
              >
                <div className="text-sm text-foreground">{c.raw_text}</div>
                <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1">
                  {c.matched_path}
                </div>
              </button>
            ))}
            {diagnostics && (
              <p className="text-[10px] text-foreground-muted italic mt-2">
                Diagnostics: {diagnostics}
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={() => setStep("choose")}>
              <ArrowLeft className="w-3 h-3 mr-1" /> Back
            </Button>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-3">
            {sourceLabel && (
              <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
                {sourceLabel}
              </div>
            )}
            <Field label="Street address" value={draft.street_address}
              onChange={(v) => setDraft({ ...draft, street_address: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Postal code" value={draft.postal_code}
                onChange={(v) => setDraft({ ...draft, postal_code: v })} />
              <Field label="City" value={draft.city}
                onChange={(v) => setDraft({ ...draft, city: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Region" value={draft.region}
                onChange={(v) => setDraft({ ...draft, region: v })} />
              <Field label="Country" value={draft.country}
                onChange={(v) => setDraft({ ...draft, country: v })} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("choose")}>
                <ArrowLeft className="w-3 h-3 mr-1" /> Back
              </Button>
              <Button disabled={busy} onClick={save}>
                {busy ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Check className="w-3 h-3 mr-1" />
                )}
                Save address
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const OptionCard = ({
  icon: Icon,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  icon: typeof Building2;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "w-full flex items-start gap-3 px-4 py-3 rounded-md border border-border bg-surface text-left transition-colors",
      disabled
        ? "opacity-50 cursor-not-allowed"
        : "hover:border-border-accent hover:bg-surface/80",
    )}
  >
    <Icon className="w-5 h-5 text-accent-teal mt-0.5 shrink-0" />
    <div className="min-w-0">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-foreground-muted mt-0.5">{subtitle}</div>
    </div>
  </button>
);

const Field = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) => (
  <div>
    <Label className="text-xs text-foreground-muted">{label}</Label>
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  </div>
);

export default AddressDiscoveryDialog;
