// Profile-3 / D-unify-b: Direct actor onboarding wizard.
//   Step 1 — Identity (+ optional registry lookup)
//   Step 2 — SharedVerificationBody (mode='fresh') — same as Complete & verify
//   Step 3 — Verification (evidence/decay/confidence/notes/programme[optional])
//
// On submit calls fn_onboard_verified_actor with the canonical
// CompletionDecision[] payload produced by SharedVerificationBody.
//
// Note: Profile-8 owns full draft-persistence restoration; identity + Step 3
// fields still persist via localStorage, but Step 2 ontology decisions are
// transient until Profile-8 lands. ("Verify actor" final label per spec.)
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Check, ChevronRight, ChevronLeft, RotateCcw } from "lucide-react";
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
import { ConfirmActorActionDialog } from "@/components/nexus/ConfirmActorActionDialog";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import { cn } from "@/lib/utils";
import type { VerificationEvidenceItem, VerifierConfidence } from "@/types/verification";
import {
  SharedVerificationBody,
  emptyCompletionSeed,
  type CompletionDecision,
} from "@/components/verification/SharedVerificationBody";
import { MediaSlotEditor, type ActorMediaRecord, type MediaSlotType } from "@/components/actor-media/MediaSlotEditor";

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

const DRAFT_KEY = "b1_onboarding_draft_v1";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 300;
const PROGRAMME_NONE = "__none__";

interface DraftShape {
  saved_at: string;
  step: 1 | 2 | 3;
  identity: {
    legalName: string;
    country: string;
    orgNumber: string;
    websites: string[];
    streetAddress: string;
    city: string;
    region: string;
  };
  verification: {
    evidence: VerificationEvidenceItem[];
    decay: string;
    confidence: VerifierConfidence | "";
    notes: string;
    programmeId: string;
  };
}

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

  // Step 2 — Ontology decisions captured from SharedVerificationBody
  const [decisions, setDecisions] = useState<CompletionDecision[]>([]);
  // Profile-8: stable session id for draft persistence across reloads
  const onboardingSessionId = useMemo(() => {
    const KEY = "nexus:onboarding:session_id";
    let v = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!v && typeof window !== "undefined") {
      v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      localStorage.setItem(KEY, v);
    }
    return v ?? "fallback-session";
  }, []);
  const draftDiscardRef = useRef<(() => Promise<void>) | null>(null);

  // Step 3 — Verification
  const [evidence, setEvidence] = useState<VerificationEvidenceItem[]>([{}]);
  const [decay, setDecay] = useState<string>("90");
  const [confidence, setConfidence] = useState<VerifierConfidence | "">("");
  const [notes, setNotes] = useState("");
  const [programmeId, setProgrammeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // P3: pending media (held in component state until actor is created)
  const [pendingLogo, setPendingLogo] = useState<ActorMediaRecord | null>(null);
  const [pendingHero, setPendingHero] = useState<ActorMediaRecord | null>(null);
  const [pendingMediaSlot, setPendingMediaSlot] = useState<MediaSlotType | null>(null);

  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // ---------- Restore draft (identity + Step 3 only — Step 2 is body-local) ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as DraftShape;
      const savedAt = new Date(draft.saved_at);
      if (Number.isNaN(savedAt.getTime()) || Date.now() - savedAt.getTime() > STALE_AFTER_MS) {
        localStorage.removeItem(DRAFT_KEY);
        toast.info(
          `Cleared a stale onboarding draft from ${savedAt.toLocaleDateString?.() ?? "an earlier session"}.`,
        );
        return;
      }
      setStep(draft.step);
      setLegalName(draft.identity?.legalName ?? "");
      setCountry(draft.identity?.country ?? "");
      setOrgNumber(draft.identity?.orgNumber ?? "");
      setWebsites(draft.identity?.websites?.length ? draft.identity.websites : [""]);
      setStreetAddress(draft.identity?.streetAddress ?? "");
      setCity(draft.identity?.city ?? "");
      setRegion(draft.identity?.region ?? "");
      setEvidence(draft.verification?.evidence?.length ? draft.verification.evidence : [{}]);
      setDecay(draft.verification?.decay ?? "90");
      setConfidence(draft.verification?.confidence ?? "");
      setNotes(draft.verification?.notes ?? "");
      setProgrammeId(draft.verification?.programmeId ?? "");
      setDraftRestoredAt(draft.saved_at);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  // ---------- Persist draft on change (debounced) ----------
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try {
        const draft: DraftShape = {
          saved_at: new Date().toISOString(),
          step,
          identity: { legalName, country, orgNumber, websites, streetAddress, city, region },
          verification: { evidence, decay, confidence, notes, programmeId },
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* quota / private mode */
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    hydrated,
    step, legalName, country, orgNumber, websites, streetAddress, city, region,
    evidence, decay, confidence, notes, programmeId,
  ]);

  const clearDraftAndReset = () => {
    localStorage.removeItem(DRAFT_KEY);
    void draftDiscardRef.current?.().catch(() => { /* non-fatal */ });
    setStep(1);
    setLegalName("");
    setCountry("");
    setOrgNumber("");
    setWebsites([""]);
    setStreetAddress("");
    setCity("");
    setRegion("");
    setDecisions([]);
    setEvidence([{}]);
    setDecay("90");
    setConfidence("");
    setNotes("");
    setProgrammeId("");
    setDraftRestoredAt(null);
  };

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
    if (!legalName.trim() || !confidence) return;
    setSubmitting(true);
    try {
      const decayOpt = DECAY_OPTIONS.find((d) => d.value === decay);
      const decays_at = decayOpt?.days
        ? new Date(Date.now() + decayOpt.days * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const cleanEvidence = evidence.filter((e) => e.source_url || e.note);

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
        p_identity: identity as never,
        // Ontology items are now carried entirely through decisions (Profile-3
        // unification). Bulk-accepted matches arrive as map-to-existing entries.
        p_ontology_items: [] as never,
        p_verification: {
          evidence: cleanEvidence,
          decays_at,
          confidence,
          notes: notes.trim() || null,
        } as never,
        p_programme_id: programmeId || null,
        p_consultant_decisions: decisions as never,
      });

      if (error) throw new Error(error.message);

      const result = (data ?? {}) as {
        actor_id: string;
        ontology_matched_count?: number;
        ontology_unmatched?: string[];
      };
      const matched = result.ontology_matched_count ?? 0;
      const unmatched = result.ontology_unmatched ?? [];
      const tagFragment =
        `${matched} ontology tag${matched === 1 ? "" : "s"} applied.` +
        (unmatched.length > 0
          ? ` ${unmatched.length} entr${unmatched.length === 1 ? "y" : "ies"} didn't match (not stored).`
          : "");
      if (programmeId) {
        toast.success(`Verified ${legalName.trim()}. ${tagFragment}`);
      } else {
        toast.success(
          `Verified ${legalName.trim()} (no programme assigned). ${tagFragment} Link to a programme later via re-verify on the actor profile.`,
        );
      }

      // P3: persist any pending media now that the actor exists
      const persistPending = async (slot: MediaSlotType, rec: ActorMediaRecord | null) => {
        if (!rec || !rec.url.startsWith("data:")) return;
        try {
          const dataUrlToBlob = (dataUrl: string): Blob => {
            const [meta, b64] = dataUrl.split(",");
            const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
          };
          const extFor = (m: string) =>
            m.includes("png") ? "png" : m.includes("webp") ? "webp" : m.includes("gif") ? "gif" : "jpg";
          const croppedBlob = dataUrlToBlob(rec.url);
          const originalBlob = rec.original_url ? dataUrlToBlob(rec.original_url) : croppedBlob;
          const baseId = crypto.randomUUID();
          const folder = `${result.actor_id}/${slot}`;
          const cPath = `${folder}/${baseId}.${extFor(croppedBlob.type)}`;
          const oPath = `${folder}/${baseId}.original.${extFor(originalBlob.type)}`;
          await supabase.storage.from("actor-media").upload(cPath, croppedBlob, { contentType: croppedBlob.type });
          await supabase.storage.from("actor-media").upload(oPath, originalBlob, { contentType: originalBlob.type });
          const cUrl = supabase.storage.from("actor-media").getPublicUrl(cPath).data.publicUrl;
          const oUrl = supabase.storage.from("actor-media").getPublicUrl(oPath).data.publicUrl;
          await supabase.from("actor_media").insert({
            actor_id: result.actor_id,
            type: slot,
            url: cUrl,
            original_url: oUrl,
            crop_data: (rec.crop_data ?? null) as any,
            source: rec.source ?? "upload",
          });
        } catch { /* non-fatal */ }
      };
      await persistPending("logo", pendingLogo);
      await persistPending("hero", pendingHero);

      localStorage.removeItem(DRAFT_KEY);
      try {
        await draftDiscardRef.current?.();
      } catch { /* non-fatal */ }
      try {
        localStorage.removeItem("nexus:onboarding:session_id");
      } catch { /* non-fatal */ }
      navigate(`/actors/${result.actor_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Onboarding failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Stable onChange handler for shared body to avoid effect thrash.
  const handleBodyChange = useCallback(
    ({ decisions: d }: { decisions: CompletionDecision[]; removedExistingTagIds: string[] }) => {
      setDecisions(d);
    },
    [],
  );

  // Stable empty seed reference — avoids re-render loop in SharedVerificationBody.
  const stableEmptySeed = useMemo(() => emptyCompletionSeed(), []);

  const canContinueStep1 = legalName.trim().length > 0;
  const canSubmit = !!confidence && !submitting;

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

        {draftRestoredAt && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-foreground">
            <span>
              Draft restored from{" "}
              <span className="font-mono">
                {new Date(draftRestoredAt).toLocaleString()}
              </span>
              . Identity and verification details preserved; re-enter ontology selections on Step 2.
            </span>
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="inline-flex items-center gap-1 text-info hover:underline"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        )}

        {/* Step indicator */}
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-foreground-muted">
            Step {step} of 3 · {step === 1 ? "Identity" : step === 2 ? "Ontology" : "Verify"}
          </div>
          <div className="text-[11px] text-foreground-muted">
            {step === 1 ? "~2 minutes" : step === 2 ? "~5 minutes" : "~2 minutes"}
          </div>
        </div>
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

            {/* P3: Media (logo + hero) — held in state until actor is created on submit */}
            <div className="space-y-3 pt-2">
              <Label className="text-xs uppercase tracking-wider text-foreground-muted">
                Media (optional)
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPendingMediaSlot("logo")}
                  className="aspect-square rounded-md border border-dashed border-border hover:border-border-accent bg-surface flex items-center justify-center overflow-hidden"
                >
                  {pendingLogo ? (
                    <img src={pendingLogo.url} alt="logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-foreground-muted">+ Logo</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingMediaSlot("hero")}
                  className="aspect-video rounded-md border border-dashed border-border hover:border-border-accent bg-surface flex items-center justify-center overflow-hidden"
                >
                  {pendingHero ? (
                    <img src={pendingHero.url} alt="hero" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-foreground-muted">+ Hero image</span>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!canContinueStep1}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 — Shared verification body (mode='fresh') */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-md p-5">
              <h3 className="text-sm font-semibold text-foreground">Ontology</h3>
              <p className="text-xs text-foreground-muted mt-1">
                Pulls proposals from {cleanWebsites()[0] || "(no website set)"} per category.
                Ontology is optional — you can skip and add it later from the actor profile.
              </p>
            </div>

            <SharedVerificationBody
              mode="fresh"
              actorContext={{ actor_name: legalName, country: country || null }}
              seed={stableEmptySeed}
              urlSeed={cleanWebsites()[0] ?? null}
              evidenceSeed={null}
              onChange={handleBodyChange}
              draftTarget={{
                targetType: "fresh_onboarding",
                clientSessionId: onboardingSessionId,
              }}
              onDraftHandle={({ discard }) => {
                draftDiscardRef.current = discard;
              }}
            />

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
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

            <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-foreground">
              Programme assignment is optional. Confidence, decay, and notes are still
              required for a meaningful verification record.
            </div>

            <div className="space-y-2">
              <Label>Programme</Label>
              <Select
                value={programmeId === "" ? PROGRAMME_NONE : programmeId}
                onValueChange={(v) => setProgrammeId(v === PROGRAMME_NONE ? "" : v)}
                disabled={progLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={progLoading ? "Loading…" : "No programme (assign later)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PROGRAMME_NONE}>No programme (assign later)</SelectItem>
                  {programmes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.client_org ? ` — ${p.client_org}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-foreground-muted">
                Onboard now without a programme. You can link this verification to a
                programme later via the re-verify flow on the actor's profile.
              </p>
              {!progLoading && programmes.length === 0 && (
                <p className="text-[11px] text-foreground-muted">
                  You don't manage any programmes — you can still onboard without one
                  and link to a programme later.
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

            <div className="text-[11px] text-foreground-muted">
              {decisions.length} ontology decision{decisions.length === 1 ? "" : "s"} captured on Step 2.
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Verifying…</> : "Verify actor"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmActorActionDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Discard your draft and start over?"
        description="This clears all fields you've filled in so far across every step. This cannot be undone."
        confirmLabel="Discard draft"
        destructive
        onConfirm={() => {
          clearDraftAndReset();
          setResetConfirmOpen(false);
        }}
      />

      {pendingMediaSlot && (
        <MediaSlotEditor
          open={!!pendingMediaSlot}
          onOpenChange={(o) => !o && setPendingMediaSlot(null)}
          actorId={null}
          slotType={pendingMediaSlot}
          defaultQuery={legalName}
          onSave={(rec) => {
            if (pendingMediaSlot === "logo") setPendingLogo(rec);
            else if (pendingMediaSlot === "hero") setPendingHero(rec);
            setPendingMediaSlot(null);
          }}
        />
      )}
    </div>
  );
};

export default OnboardingPage;
