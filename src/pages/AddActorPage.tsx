// V3 Batch C §3 — Hybrid Add Actor flow.
// Two screens: Identify (registry-first) → Confirm (pre-filled or blank).
// Always tries the registry first; "Skip registry" link is visible but secondary.
// On save, creates the actor row via fn_create_actor_hybrid and redirects to
// the new actor's profile.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGISTRIES, type RegistryId } from "@/config/registries";
import { COUNTRY_LIST } from "@/lib/normalizeCountry";

const registryName = (id: RegistryId | undefined): string =>
  id ? REGISTRIES.find((r) => r.id === id)?.name ?? id : "registry";

interface FormData {
  legal_name: string;
  org_number: string;
  country: string;
  street_address: string;
  city: string;
  region: string;
  postal_code: string;
  website: string;
  trade_names: string;
  source: "registry" | "manual";
}

const COUNTRY_TO_REGISTRY: Record<string, RegistryId> = {
  NO: "brreg",
  DK: "cvr",
  FI: "prh",
};

const emptyForm: FormData = {
  legal_name: "",
  org_number: "",
  country: "NO",
  street_address: "",
  city: "",
  region: "",
  postal_code: "",
  website: "",
  trade_names: "",
  source: "manual",
};

const AddActorPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [country, setCountry] = useState("NO");
  const [orgNumber, setOrgNumber] = useState("");
  const [entityKind, setEntityKind] = useState<"itself" | "subsidiary">("itself");
  const [looking, setLooking] = useState(false);
  const [registryBanner, setRegistryBanner] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const registryId = COUNTRY_TO_REGISTRY[country];

  const lookup = async () => {
    if (!orgNumber.trim()) {
      toast.error("Enter an org number to look up");
      return;
    }
    if (!registryId) {
      toast.error(`No registry configured for ${country}. Use "Skip registry" instead.`);
      return;
    }
    setLooking(true);
    setRegistryBanner(null);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-from-registry", {
        body: { mode: "org_number", org_number: orgNumber.trim(), registry: registryId },
      });
      if (error) throw new Error(error.message);
      if (data?.mode === "single" && data.proposal) {
        const p = data.proposal;
        if (entityKind === "subsidiary") {
          setForm({
            ...emptyForm,
            country,
            source: "manual",
          });
          setRegistryBanner(
            `Found parent "${p.actor_name}". Subsidiary mode selected — enter the subsidiary's identity below.`,
          );
        } else {
          setForm({
            legal_name: p.actor_name ?? "",
            org_number: p.org_number ?? orgNumber.trim(),
            country: p.country ?? country,
            street_address: p.street_address ?? "",
            city: p.city ?? "",
            region: p.region ?? "",
            postal_code: p.postal_code ?? "",
            website: p.actor_website ?? "",
            trade_names: (p.trade_names ?? []).join(", "),
            source: "registry",
          });
          setRegistryBanner(`Pre-filled from ${registryName(registryId)}.`);
        }
      } else {
        setForm({ ...emptyForm, country, org_number: orgNumber.trim(), source: "manual" });
        setRegistryBanner(
          `Not found in ${registryName(registryId)}. Continue with blank form.`,
        );
      }
      setStep(2);
    } catch (e: any) {
      toast.error(`Lookup failed: ${e?.message ?? "unknown"}`);
      // Still let editor proceed to blank form.
      setForm({ ...emptyForm, country, org_number: orgNumber.trim(), source: "manual" });
      setRegistryBanner(`Lookup error — continue with blank form.`);
      setStep(2);
    } finally {
      setLooking(false);
    }
  };

  const skipRegistry = () => {
    setForm({ ...emptyForm, country, source: "manual" });
    setRegistryBanner(null);
    setStep(2);
  };

  const save = async () => {
    if (!form.legal_name.trim()) {
      toast.error("Legal name is required");
      return;
    }
    setSaving(true);
    try {
      const trade_names = form.trade_names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Record<string, any> = {
        legal_name: form.legal_name.trim(),
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        postal_code: form.postal_code.trim() || null,
        websites: form.website.trim() ? [form.website.trim()] : [],
        trade_names,
      };
      const { data, error } = await supabase.rpc("fn_create_actor_hybrid", {
        p_country: form.country || null,
        p_org_number: form.org_number || null,
        p_data: payload as never,
        p_source: form.source,
      });
      if (error) throw new Error(error.message);
      const result = data as { status: string; actor_id?: string; existing_actor_id?: string; message?: string };
      if (result.status === "duplicate_actor" && result.existing_actor_id) {
        toast.error(`Actor already exists. Opening existing record.`);
        navigate(`/actors/${result.existing_actor_id}`);
        return;
      }
      if (result.status === "created" && result.actor_id) {
        toast.success("Actor created");
        // TODO Batch B.2: ?wizard=1 to auto-launch the completion wizard.
        navigate(`/actors/${result.actor_id}?wizard=1`);
        return;
      }
      throw new Error(result.message ?? "Unknown response");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Add actor</h1>
          <p className="text-body-sm text-foreground-muted">
            Step {step} of 2 — {step === 1 ? "identify" : "confirm & enrich"}
          </p>
        </header>

        {step === 1 && (
          <div className="space-y-5 rounded-md border border-border bg-surface p-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_LIST.map((c) => {
                    const reg = COUNTRY_TO_REGISTRY[c.iso];
                    return (
                      <SelectItem key={c.iso} value={c.iso}>
                        {c.name}
                        {reg ? ` (${reg.toUpperCase()})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Org number</Label>
              <Input
                value={orgNumber}
                onChange={(e) => setOrgNumber(e.target.value)}
                placeholder={
                  registryId ? `e.g. 975995453 (${registryName(registryId)})` : "Org / registration number"
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Are you adding the entity itself, or a subsidiary?</Label>
              <RadioGroup
                value={entityKind}
                onValueChange={(v) => setEntityKind(v as "itself" | "subsidiary")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="itself" value="itself" />
                  <Label htmlFor="itself" className="text-xs cursor-pointer">
                    The entity itself
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="subsidiary" value="subsidiary" />
                  <Label htmlFor="subsidiary" className="text-xs cursor-pointer">
                    A subsidiary
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={skipRegistry}
                className="text-xs text-foreground-muted hover:text-foreground underline"
              >
                Skip registry — start with blank form
              </button>
              <Button onClick={lookup} disabled={looking || !registryId}>
                {looking ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Search className="w-3 h-3 mr-1.5" />
                )}
                Look up in registry
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            {!registryId && (
              <p className="text-[11px] text-foreground-muted italic">
                No registry configured for {country}. Use “Skip registry” to continue manually.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {registryBanner && (
              <div className="rounded border border-info/30 bg-info/5 px-3 py-2 text-xs text-foreground-secondary">
                {registryBanner}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface p-5">
              <Field label="Legal name *" required>
                <Input
                  value={form.legal_name}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                />
              </Field>
              <Field label="Org number">
                <Input
                  value={form.org_number}
                  onChange={(e) => setForm({ ...form, org_number: e.target.value })}
                />
              </Field>
              <Field label="Country">
                <Select
                  value={form.country || ""}
                  onValueChange={(v) => setForm({ ...form, country: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_LIST.map((c) => (
                      <SelectItem key={c.iso} value={c.iso}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Website">
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </Field>
              <Field label="Street address" wide>
                <Input
                  value={form.street_address}
                  onChange={(e) => setForm({ ...form, street_address: e.target.value })}
                />
              </Field>
              <Field label="Postal code">
                <Input
                  value={form.postal_code}
                  onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                />
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
              <Field label="Region">
                <Input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                />
              </Field>
              <Field label="Trade names (comma-separated)" wide>
                <Input
                  value={form.trade_names}
                  onChange={(e) => setForm({ ...form, trade_names: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={save} disabled={saving || !form.legal_name.trim()}>
                {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
                Save and verify
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Field = ({
  label,
  children,
  wide,
  required,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  required?: boolean;
}) => (
  <div className={`space-y-1.5 ${wide ? "col-span-2" : ""}`}>
    <Label className="text-xs">
      {label}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
    {children}
  </div>
);

export default AddActorPage;
