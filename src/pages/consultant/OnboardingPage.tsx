// Phase 6.5 / B1: Direct actor onboarding wizard.
// Consultant or admin seeds a verified actor in one flow:
//   Step 1 — Identity (+ optional registry lookup)
//   Step 2 — AI ontology scrape per section (optional)
//   Step 3 — Commit (evidence/decay/confidence/notes/programme) → fn_onboard_verified_actor
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Check, ChevronRight, ChevronLeft, X as XIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProposalReviewList, type ReviewProposal } from "@/components/nexus/ProposalReviewList";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import { cn } from "@/lib/utils";
import type { VerificationEvidenceItem, VerifierConfidence } from "@/types/verification";

type SectionKey = "capabilities" | "competences" | "domains" | "products" | "services";
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "capabilities", label: "Capabilities" },
  { key: "competences", label: "Competences" },
  { key: "domains", label: "Domains" },
  { key: "products", label: "Product types" },
  { key: "services", label: "Service types" },
];

interface AcceptedItem {
  entry_name: string;
  source: "url_scrape" | "manual";
  source_url?: string | null;
  evidence?: string;
  confidence: "high" | "medium" | "low";
}

type SectionState = {
  loading: boolean;
  error: string | null;
  proposals: ReviewProposal[];
  accepted: AcceptedItem[];
  scraped: boolean;
};

const emptySection = (): SectionState => ({
  loading: false,
  error: null,
  proposals: [],
  accepted: [],
  scraped: false,
});

const DECAY_OPTIONS = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "180", label: "180 days", days: 180 },
  { value: "none", label: "No decay", days: null as number | null },
];

const COUNTRY_OPTIONS = [
  { value: "NO", label: "Norway" },
  { value: "DK", label: "Denmark" },
  { value: "SE", label: "Sweden" },
  { value: "FI", label: "Finland" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "NL", label: "Netherlands" },
  { value: "PL", label: "Poland" },
  { value: "EE", label: "Estonia" },
  { value: "LV", label: "Latvia" },
  { value: "LT", label: "Lithuania" },
];

const REGISTRY_BY_COUNTRY: Record<string, string> = {
  NO: "brreg",
  DK: "cvr",
  FI: "prh",
};

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { programmes, loading: progLoading } = useManagedProgrammes();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — Identity
  const [legalName, setLegalName] = useState("");
  const [country, setCountry] = useState<string>("");
  const [orgNumber, setOrgNumber] = useState("");
  const [websites, setWebsites] = useState<string[]>([""]);
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [registryBusy, setRegistryBusy] = useState(false);

  // Step 2 — Ontology
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({
    capabilities: emptySection(),
    competences: emptySection(),
    domains: emptySection(),
    products: emptySection(),
    services: emptySection(),
  });
  const [manualDrafts, setManualDrafts] = useState<
    Record<SectionKey, { entry_name: string; evidence: string; confidence: "high" | "medium" | "low" } | null>
  >({
    capabilities: null,
    competences: null,
    domains: null,
    products: null,
    services: null,
  });

  // Step 3 — Verification
  const [evidence, setEvidence] = useState<VerificationEvidenceItem[]>([{}]);
  const [decay, setDecay] = useState<string>("90");
  const [confidence, setConfidence] = useState<VerifierConfidence | "">("");
  const [notes, setNotes] = useState("");
  const [programmeId, setProgrammeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const cleanWebsites = () => websites.map((w) => w.trim()).filter(Boolean);

  // ---------- Registry lookup ----------
  const handleRegistryLookup = async () => {
    const reg = REGISTRY_BY_COUNTRY[country];
    if (!reg) {
      toast.error("Registry lookup is only supported for NO, DK, FI.");
      return;
    }
    if (!orgNumber.trim()) {
      toast.error("Enter an org number first.");
      return;
    }
    setRegistryBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-from-registry", {
        body: { mode: "org_number", org_number: orgNumber.trim(), registry: reg },
      });
      if (error) throw new Error(error.message);
      const p = data?.proposal;
      if (!p) {
        toast.error("Registry returned no result.");
        return;
      }
      if (p.actor_name && !legalName.trim()) setLegalName(p.actor_name);
      if (p.street_address) setStreetAddress(p.street_address);
      if (p.city) setCity(p.city);
      if (p.region) setRegion(p.region);
      if (p.actor_website) {
        setWebsites((prev) => {
          const filled = prev.filter((w) => w.trim());
          return filled.length === 0 ? [p.actor_website] : [...filled, p.actor_website];
        });
      }
      toast.success("Registry data loaded. You can edit any field before continuing.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registry lookup failed");
    } finally {
      setRegistryBusy(false);
    }
  };

  // ---------- Ontology scraping ----------
  const scrapeSection = async (key: SectionKey, label: string) => {
    const url = cleanWebsites()[0];
    if (!url) {
      toast.error("Add a website URL on Step 1 first.");
      return;
    }
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: null } }));
    try {
      const { data, error } = await supabase.functions.invoke("enrich-from-url", {
        body: {
          url,
          section_key: key,
          actor_context: {
            actor_name: legalName,
            country: country || null,
            actor_website: url,
          },
          existing_items: sections[key].accepted.map((a) => a.entry_name),
        },
      });
      if (error) throw new Error(error.message);
      const proposals = (data?.proposals ?? []) as ReviewProposal[];
      setSections((prev) => ({
        ...prev,
        [key]: { ...prev[key], loading: false, proposals, scraped: true },
      }));
      if (proposals.length === 0) {
        toast.info(`No new ${label.toLowerCase()} proposals from this URL.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scrape failed";
      setSections((prev) => ({ ...prev, [key]: { ...prev[key], loading: false, error: msg } }));
      toast.error(msg);
    }
  };

  const scrapeAll = async () => {
    for (const s of SECTIONS) {
      await scrapeSection(s.key, s.label);
    }
  };

  const acceptProposal = (key: SectionKey, proposal: ReviewProposal) => {
    const url = cleanWebsites()[0] ?? null;
    setSections((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        accepted: [
          ...prev[key].accepted,
          {
            entry_name: proposal.entry_name,
            source: "url_scrape",
            source_url: proposal.source_url ?? url,
            evidence: proposal.evidence,
            confidence: proposal.confidence,
          },
        ],
        proposals: prev[key].proposals.filter((p) => p !== proposal),
      },
    }));
  };

  const dismissProposal = (key: SectionKey, idx: number) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], proposals: prev[key].proposals.filter((_, i) => i !== idx) },
    }));
  };

  const acceptAll = (key: SectionKey) => {
    const url = cleanWebsites()[0] ?? null;
    setSections((prev) => {
      const sec = prev[key];
      const newAccepted = sec.proposals.map((p) => ({
        entry_name: p.entry_name,
        source: "url_scrape" as const,
        source_url: p.source_url ?? url,
        evidence: p.evidence,
        confidence: p.confidence,
      }));
      return {
        ...prev,
        [key]: { ...sec, accepted: [...sec.accepted, ...newAccepted], proposals: [] },
      };
    });
  };

  const dismissAll = (key: SectionKey) =>
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], proposals: [] } }));

  const removeAccepted = (key: SectionKey, idx: number) =>
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], accepted: prev[key].accepted.filter((_, i) => i !== idx) },
    }));

  const startManual = (key: SectionKey) =>
    setManualDrafts((prev) => ({
      ...prev,
      [key]: { entry_name: "", evidence: "", confidence: "medium" },
    }));

  const cancelManual = (key: SectionKey) =>
    setManualDrafts((prev) => ({ ...prev, [key]: null }));

  const saveManual = (key: SectionKey) => {
    const draft = manualDrafts[key];
    if (!draft || !draft.entry_name.trim()) return;
    setSections((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        accepted: [
          ...prev[key].accepted,
          {
            entry_name: draft.entry_name.trim(),
            source: "manual",
            evidence: draft.evidence.trim() || undefined,
            confidence: draft.confidence,
          },
        ],
      },
    }));
    cancelManual(key);
  };

  // ---------- Step 3 helpers ----------
  const addEvidence = () =>
    evidence.length < 5 && setEvidence((prev) => [...prev, {}]);
  const removeEvidence = (i: number) =>
    setEvidence((prev) => prev.filter((_, idx) => idx !== i));
  const updateEvidence = (i: number, field: keyof VerificationEvidenceItem, value: string) =>
    setEvidence((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value || undefined } : e)),
    );

  const handleSubmit = async () => {
    if (!legalName.trim() || !confidence || !programmeId) return;
    setSubmitting(true);
    try {
      const decayOpt = DECAY_OPTIONS.find((d) => d.value === decay);
      const decays_at = decayOpt?.days
        ? new Date(Date.now() + decayOpt.days * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const cleanEvidence = evidence.filter((e) => e.source_url || e.note);

      const ontologyItems = SECTIONS.flatMap((s) =>
        sections[s.key].accepted.map((a) => ({
          entry_name: a.entry_name,
          source: a.source,
          confidence: a.confidence,
          evidence: a.evidence ?? null,
          source_url: a.source_url ?? null,
        })),
      );

      const identity = {
        legal_name: legalName.trim(),
        org_number: orgNumber.trim() || null,
        country: country || null,
        websites: cleanWebsites(),
        street_address: streetAddress.trim() || null,
        city: city.trim() || null,
        region: region.trim() || null,
      };

      const { data, error } = await supabase.rpc("fn_onboard_verified_actor", {
        p_identity: identity,
        p_ontology_items: ontologyItems,
        p_verification: {
          evidence: cleanEvidence,
          decays_at,
          confidence,
          notes: notes.trim() || null,
        },
        p_programme_id: programmeId,
      });

      if (error) throw new Error(error.message);

      const result = (data ?? {}) as {
        actor_id: string;
        ontology_matched_count?: number;
        ontology_unmatched?: string[];
      };
      const matched = result.ontology_matched_count ?? 0;
      const unmatched = result.ontology_unmatched ?? [];
      toast.success(
        `Onboarded ${legalName.trim()}. ${matched} ontology tag${matched === 1 ? "" : "s"} applied.` +
          (unmatched.length > 0
            ? ` ${unmatched.length} entr${unmatched.length === 1 ? "y" : "ies"} didn't match (not stored).`
            : ""),
      );
      navigate(`/actors/${result.actor_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Onboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Render ----------
  const canContinueStep1 = legalName.trim().length > 0;
  const canSubmit = !!confidence && !!programmeId && !submitting;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Onboard verified actor</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Direct path for consultants and admins to seed the verified actor database.
            Satellite data (certifications, contacts, customer history) can be added from
            the actor profile after onboarding.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border",
                  step === n
                    ? "bg-primary text-primary-foreground border-primary"
                    : step > n
                    ? "bg-success/20 text-success border-success/40"
                    : "bg-surface text-foreground-muted border-border",
                )}
              >
                {step > n ? <Check className="w-3.5 h-3.5" /> : n}
              </div>
              <span
                className={cn(
                  "text-xs uppercase tracking-wider font-medium",
                  step === n ? "text-foreground" : "text-foreground-muted",
                )}
              >
                {n === 1 ? "Identity" : n === 2 ? "Ontology" : "Verify"}
              </span>
              {n < 3 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-5 bg-surface border border-border rounded-md p-5">
            <div className="space-y-2">
              <Label>
                Legal name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Kongsberg Defence & Aerospace AS"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Org number</Label>
                <div className="flex gap-2">
                  <Input
                    value={orgNumber}
                    onChange={(e) => setOrgNumber(e.target.value)}
                    placeholder="e.g. 989138671"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRegistryLookup}
                    disabled={registryBusy || !orgNumber.trim() || !REGISTRY_BY_COUNTRY[country]}
                  >
                    {registryBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
                  </Button>
                </div>
                {country && !REGISTRY_BY_COUNTRY[country] && (
                  <p className="text-[11px] text-foreground-muted">
                    Registry lookup supported for NO, DK, FI.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Websites</Label>
              {websites.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={w}
                    onChange={(e) =>
                      setWebsites((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder="https://..."
                  />
                  {websites.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setWebsites((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setWebsites((p) => [...p, ""])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add website
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Street address</Label>
                <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Input value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!canContinueStep1}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-md p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI ontology scrape</h3>
                  <p className="text-xs text-foreground-muted mt-1">
                    Pulls proposals from {cleanWebsites()[0] || "(no website set)"} per category.
                    Ontology is optional — you can skip and add it later from the actor profile.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={scrapeAll}
                  disabled={!cleanWebsites()[0] || SECTIONS.some((s) => sections[s.key].loading)}
                >
                  Scrape all sections
                </Button>
              </div>
            </div>

            {SECTIONS.map((s) => {
              const sec = sections[s.key];
              const draft = manualDrafts[s.key];
              return (
                <div key={s.key} className="bg-surface border border-border rounded-md p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{s.label}</h4>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => scrapeSection(s.key, s.label)}
                        disabled={sec.loading || !cleanWebsites()[0]}
                      >
                        {sec.loading ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Scraping…</>
                        ) : (
                          sec.scraped ? "Re-scrape" : "Scrape"
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => startManual(s.key)} disabled={!!draft}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add manual
                      </Button>
                    </div>
                  </div>

                  {sec.error && (
                    <p className="text-xs text-destructive">{sec.error}</p>
                  )}

                  {sec.accepted.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-foreground-muted">Accepted</div>
                      <ul className="space-y-1">
                        {sec.accepted.map((a, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm bg-elevated/50 border border-border rounded px-2 py-1">
                            <Check className="w-3.5 h-3.5 text-success shrink-0" />
                            <span className="font-mono">{a.entry_name}</span>
                            <span className="text-[10px] text-foreground-muted uppercase">{a.source}</span>
                            <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => removeAccepted(s.key, i)}>
                              <XIcon className="w-3 h-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {draft && (
                    <div className="border border-dashed border-border rounded-md p-3 space-y-2">
                      <Input
                        placeholder="Entry name (must match an existing ontology entry)"
                        value={draft.entry_name}
                        onChange={(e) =>
                          setManualDrafts((prev) => ({ ...prev, [s.key]: { ...draft, entry_name: e.target.value } }))
                        }
                      />
                      <Input
                        placeholder="Evidence (optional)"
                        value={draft.evidence}
                        onChange={(e) =>
                          setManualDrafts((prev) => ({ ...prev, [s.key]: { ...draft, evidence: e.target.value } }))
                        }
                      />
                      <div className="flex items-center justify-between">
                        <RadioGroup
                          value={draft.confidence}
                          onValueChange={(v) =>
                            setManualDrafts((prev) => ({ ...prev, [s.key]: { ...draft, confidence: v as "high" | "medium" | "low" } }))
                          }
                          className="flex gap-3"
                        >
                          {(["high", "medium", "low"] as const).map((c) => (
                            <div key={c} className="flex items-center gap-1">
                              <RadioGroupItem value={c} id={`${s.key}-mc-${c}`} />
                              <Label htmlFor={`${s.key}-mc-${c}`} className="text-xs capitalize">{c}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => cancelManual(s.key)}>Cancel</Button>
                          <Button size="sm" onClick={() => saveManual(s.key)} disabled={!draft.entry_name.trim()}>Add</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {sec.proposals.length > 0 && (
                    <ProposalReviewList
                      proposals={sec.proposals}
                      acceptingIdx={null}
                      bulkAccepting={false}
                      onAcceptOne={(p) => acceptProposal(s.key, p)}
                      onDismissOne={(idx) => dismissProposal(s.key, idx)}
                      onAcceptAll={() => acceptAll(s.key)}
                      onDismissAll={() => dismissAll(s.key)}
                      onClose={() =>
                        setSections((prev) => ({ ...prev, [s.key]: { ...prev[s.key], proposals: [] } }))
                      }
                    />
                  )}

                  {!sec.loading && sec.scraped && sec.proposals.length === 0 && sec.accepted.length === 0 && (
                    <p className="text-xs text-foreground-muted italic">No proposals.</p>
                  )}
                </div>
              );
            })}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-5 bg-surface border border-border rounded-md p-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Verification details</h3>
              <p className="text-xs text-foreground-muted mt-1">
                Recorded as the verification event for this actor.
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                Programme <span className="text-destructive">*</span>
              </Label>
              <Select value={programmeId} onValueChange={setProgrammeId} disabled={progLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={progLoading ? "Loading…" : "Select programme"} />
                </SelectTrigger>
                <SelectContent>
                  {programmes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.client_org ? ` — ${p.client_org}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!progLoading && programmes.length === 0 && (
                <p className="text-xs text-warning">
                  You don't manage any programmes. Create one first or ask an admin to add you.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Evidence sources (optional, up to 5)</Label>
              {evidence.map((e, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <Input
                      value={e.source_url ?? ""}
                      onChange={(ev) => updateEvidence(i, "source_url", ev.target.value)}
                      placeholder="https://source-url..."
                    />
                    <Input
                      value={e.note ?? ""}
                      onChange={(ev) => updateEvidence(i, "note", ev.target.value)}
                      placeholder="Note about this source"
                    />
                  </div>
                  {evidence.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeEvidence(i)} className="mt-1">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {evidence.length < 5 && (
                <Button variant="ghost" size="sm" onClick={addEvidence}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add source
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Decay window</Label>
              <RadioGroup value={decay} onValueChange={setDecay} className="flex gap-4 flex-wrap">
                {DECAY_OPTIONS.map((d) => (
                  <div key={d.value} className="flex items-center gap-2">
                    <RadioGroupItem value={d.value} id={`onb-decay-${d.value}`} />
                    <Label htmlFor={`onb-decay-${d.value}`} className="font-normal cursor-pointer">
                      {d.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Confidence <span className="text-destructive">*</span></Label>
              <RadioGroup
                value={confidence}
                onValueChange={(v) => setConfidence(v as VerifierConfidence)}
                className="flex gap-4"
              >
                {(["high", "medium", "low"] as const).map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <RadioGroupItem value={c} id={`onb-conf-${c}`} />
                    <Label htmlFor={`onb-conf-${c}`} className="font-normal capitalize cursor-pointer">{c}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Verifier notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional context for this verification…"
                rows={3}
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={submitting}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Onboarding…</> : "Onboard actor"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
