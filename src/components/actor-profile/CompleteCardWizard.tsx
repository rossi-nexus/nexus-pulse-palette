// V3 Batch B.2 — Complete-this-card wizard.
//
// A right-side Sheet that walks the editor through every missing/partial
// section on the current actor. Designed to be opened either:
//   • manually from the profile header (when at least one card is ◐ or ○), or
//   • automatically from the hybrid Add Actor flow via ?wizard=1.
//
// Flow: scan → plan (skip checkboxes) → walk (per-section input) → confirm.
// Skipped sections are persisted to actor_section_skips and treated as
// "complete" by the presence dot logic in ActorProfile.
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  X,
  Sparkles,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import AddressDiscoveryDialog from "./AddressDiscoveryDialog";

// ---- Shared helper: ensure the actor has a website on file ----
// Tries auto-discovery via Serper first, falls back to user input. Persists
// the chosen URL onto actors.websites and returns it.
const useWebsiteResolver = (actorId: string, actorName: string, initial: string | null) => {
  const [website, setWebsite] = useState<string | null>(initial);
  const [input, setInput] = useState("");
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ url: string; host: string; title: string }>>([]);

  const refresh = async () => {
    const { data } = await supabase
      .from("actors")
      .select("websites, country")
      .eq("id", actorId)
      .maybeSingle();
    const w = (data?.websites as string[] | null)?.[0] ?? null;
    setWebsite(w);
    return { website: w, country: (data?.country as string | null) ?? null };
  };

  const persist = async (raw: string): Promise<string | null> => {
    let url = raw.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const { error } = await supabase
      .from("actors")
      .update({ websites: [url] })
      .eq("id", actorId);
    if (error) {
      toast.error(`Could not save website: ${error.message}`);
      return null;
    }
    setWebsite(url);
    return url;
  };

  const findAutomatically = async () => {
    setFinding(true);
    try {
      const { country } = await refresh();
      const { data, error } = await supabase.functions.invoke("find-actor-website", {
        body: { actor_name: actorName, country },
      });
      if (error) {
        const detail = (data as any)?.error ?? error.message;
        throw new Error(detail);
      }
      const list = (data as any)?.candidates ?? [];
      if (list.length === 0) {
        toast.error("No website found via web search. Paste one below.");
        return null;
      }
      setCandidates(list);
      const top = (data as any)?.website as string | null;
      if (top) {
        const saved = await persist(top);
        if (saved) toast.success(`Website set to ${new URL(saved).hostname}`);
        return saved;
      }
      return null;
    } catch (e: any) {
      toast.error(`Find website failed: ${e?.message ?? "unknown"}`);
      return null;
    } finally {
      setFinding(false);
    }
  };

  return {
    website,
    setWebsite,
    input,
    setInput,
    finding,
    candidates,
    persist,
    findAutomatically,
    refresh,
  };
};

// Inline UI shown above an editor when no website is on file.
const WebsiteResolverPanel = ({
  resolver,
}: {
  resolver: ReturnType<typeof useWebsiteResolver>;
}) => {
  if (resolver.website) return null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface px-3 py-2">
      <div className="text-xs text-foreground-muted">
        No website on file. Add one to enable auto-enrichment.
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="e.g. equipnor.no"
          value={resolver.input}
          onChange={(e) => resolver.setInput(e.target.value)}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!resolver.input.trim()}
          onClick={() => resolver.persist(resolver.input)}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={resolver.findAutomatically}
          disabled={resolver.finding}
        >
          {resolver.finding ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Search className="w-3 h-3 mr-1" />
          )}
          Find automatically
        </Button>
      </div>
      {resolver.candidates.length > 1 && (
        <div className="space-y-1 pt-1">
          <div className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Other matches
          </div>
          {resolver.candidates.slice(1).map((c) => (
            <button
              key={c.url}
              type="button"
              onClick={() => resolver.persist(c.url)}
              className="block w-full text-left text-xs text-foreground-secondary hover:text-foreground hover:underline"
            >
              {c.host} — {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export type WizardSectionKey =
  | "address"
  | "logo"
  | "hero"
  | "description"
  | "contacts"
  | "capabilities"
  | "competences"
  | "domains"
  | "products"
  | "services"
  | "aliases"
  | "relationships"
  | "credentials";

export interface SectionStatus {
  key: WizardSectionKey;
  label: string;
  helpText: string;
  presence: "missing" | "partial";
  cardLabel: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actorId: string;
  actorName: string;
  orgNumber: string | null;
  website: string | null;
  country: string | null;
  sections: SectionStatus[];
  /** Currently-skipped section keys (from actor_section_skips). */
  skipped: Array<{ section_key: string; reason: string | null }>;
  /** Editor's user id — written to actor_section_skips.skipped_by + as verifier on writes. */
  viewerId: string;
  onChanged: () => void;
}

type Phase = "plan" | "walk" | "confirm";

const CompleteCardWizard = ({
  open,
  onClose,
  actorId,
  actorName,
  orgNumber,
  website,
  country,
  sections,
  skipped,
  viewerId,
  onChanged,
}: Props) => {
  const [phase, setPhase] = useState<Phase>("plan");
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [skipReason, setSkipReason] = useState<Record<string, string>>({});
  const [showSkipped, setShowSkipped] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [stats, setStats] = useState({ added: 0, skipped: 0 });
  const [busy, setBusy] = useState(false);

  // Initialise keep map from sections — only when the wizard opens, so that
  // refreshing actor data mid-walk (via onChanged) does not reset the phase
  // back to "plan".
  useEffect(() => {
    if (!open) return;
    setPhase("plan");
    setStepIdx(0);
    setStats({ added: 0, skipped: 0 });
    const init: Record<string, boolean> = {};
    sections.forEach((s) => {
      init[s.key] = true;
    });
    setKeep(init);
    setSkipReason({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const skippedKeys = new Set(skipped.map((s) => s.section_key));
  const visibleSections = useMemo(
    () =>
      sections.filter((s) => showSkipped || !skippedKeys.has(s.key)),
    [sections, showSkipped, skipped],
  );

  const keptList = visibleSections.filter((s) => keep[s.key]);
  const currentStep = keptList[stepIdx] ?? null;

  // ---------- Plan → Walk ----------
  const beginWalk = async () => {
    setBusy(true);
    // Persist skip rows for any visible section the editor unchecked.
    const toSkip = visibleSections.filter(
      (s) => !keep[s.key] && !skippedKeys.has(s.key),
    );
    if (toSkip.length > 0) {
      const rows = toSkip.map((s) => ({
        actor_id: actorId,
        section_key: s.key,
        reason: skipReason[s.key]?.trim() || null,
        skipped_by: viewerId,
      }));
      const { error } = await supabase.from("actor_section_skips").insert(rows);
      if (error) {
        toast.error(`Could not persist skips: ${error.message}`);
        setBusy(false);
        return;
      }
      setStats((s) => ({ ...s, skipped: s.skipped + rows.length }));
    }
    setBusy(false);
    if (keptList.length === 0) {
      setPhase("confirm");
      onChanged();
      return;
    }
    setPhase("walk");
    setStepIdx(0);
  };

  // ---------- Un-skip ----------
  const unskip = async (key: string) => {
    const { error } = await supabase
      .from("actor_section_skips")
      .delete()
      .eq("actor_id", actorId)
      .eq("section_key", key);
    if (error) {
      toast.error(`Could not un-skip: ${error.message}`);
      return;
    }
    toast.success("Un-skipped");
    onChanged();
  };

  const advance = (added: boolean) => {
    if (added) setStats((s) => ({ ...s, added: s.added + 1 }));
    if (stepIdx + 1 >= keptList.length) {
      setPhase("confirm");
      onChanged();
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto bg-elevated border-border"
      >
        <SheetHeader>
          <SheetTitle className="text-foreground">
            Complete this card · {actorName}
          </SheetTitle>
          <SheetDescription>
            {phase === "plan" &&
              "Review what's missing. Uncheck anything you want to mark not applicable."}
            {phase === "walk" &&
              `Step ${stepIdx + 1} of ${keptList.length} — ${currentStep?.cardLabel ?? ""}`}
            {phase === "confirm" && "Done."}
          </SheetDescription>
        </SheetHeader>

        {phase === "plan" && (
          <div className="mt-4 space-y-4">
            {skipped.length > 0 && (
              <div className="flex items-center justify-between bg-surface/60 border border-border rounded-md px-3 py-2">
                <Label className="text-xs text-foreground-muted">
                  Show {skipped.length} previously-skipped section(s)
                </Label>
                <Switch
                  checked={showSkipped}
                  onCheckedChange={setShowSkipped}
                />
              </div>
            )}

            {visibleSections.length === 0 ? (
              <div className="text-sm text-foreground-muted py-6 text-center">
                Nothing to complete on this actor. 🎉
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleSections.map((s) => {
                  const isSkipped = skippedKeys.has(s.key);
                  return (
                    <li
                      key={s.key}
                      className={cn(
                        "rounded-md border border-border bg-surface px-3 py-2",
                        isSkipped && "opacity-60",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={!!keep[s.key] && !isSkipped}
                          disabled={isSkipped}
                          onCheckedChange={(v) =>
                            setKeep({ ...keep, [s.key]: !!v })
                          }
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-sm font-medium text-foreground",
                                isSkipped && "line-through",
                              )}
                            >
                              {s.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                              {s.cardLabel} · {s.presence}
                            </span>
                          </div>
                          <p className="text-xs text-foreground-muted mt-0.5">
                            {s.helpText}
                          </p>
                          {isSkipped ? (
                            <div className="flex items-center justify-between mt-2 text-xs">
                              <span className="text-foreground-muted italic">
                                Skipped: {
                                  skipped.find((sk) => sk.section_key === s.key)?.reason ?? "no reason"
                                }
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs"
                                onClick={() => unskip(s.key)}
                              >
                                Un-skip
                              </Button>
                            </div>
                          ) : !keep[s.key] ? (
                            <Input
                              placeholder="Why skip? (optional)"
                              value={skipReason[s.key] ?? ""}
                              onChange={(e) =>
                                setSkipReason({
                                  ...skipReason,
                                  [s.key]: e.target.value,
                                })
                              }
                              className="mt-2 h-7 text-xs"
                            />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={beginWalk} disabled={busy}>
                {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Start
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {phase === "walk" && currentStep && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {currentStep.label}
              </h3>
              <p className="text-xs text-foreground-muted mt-0.5">
                {currentStep.helpText}
              </p>
            </div>

            <SectionEditor
              section={currentStep}
              actorId={actorId}
              actorName={actorName}
              orgNumber={orgNumber}
              website={website}
              country={country}
              viewerId={viewerId}
              onDone={() => advance(true)}
              onChanged={onChanged}
            />

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                size="sm"
                variant="ghost"
                disabled={stepIdx === 0}
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="w-3 h-3 mr-1" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => advance(false)}>
                  Skip this step
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>
                  <X className="w-3 h-3 mr-1" /> Cancel wizard
                </Button>
              </div>
            </div>
          </div>
        )}

        {phase === "confirm" && (
          <div className="mt-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
            <div>
              <div className="text-base font-semibold text-foreground">
                Wizard complete
              </div>
              <div className="text-sm text-foreground-muted mt-1">
                {stats.added} section(s) updated · {stats.skipped} marked not applicable.
              </div>
            </div>
            <Button onClick={onClose}>Save and close</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ============================================================
// Per-section editors
// ============================================================
interface EditorProps {
  section: SectionStatus;
  actorId: string;
  actorName: string;
  orgNumber: string | null;
  website: string | null;
  country: string | null;
  viewerId: string;
  onDone: () => void;
  onChanged: () => void;
}

const SectionEditor = (props: EditorProps) => {
  switch (props.section.key) {
    case "address":
      return <AddressEditor {...props} />;
    case "description":
      return <DescriptionEditor {...props} />;
    case "logo":
    case "hero":
      return <MediaEditor {...props} type={props.section.key} />;
    case "contacts":
      return <ContactsEditor {...props} />;
    case "capabilities":
    case "competences":
    case "domains":
    case "products":
    case "services":
      return <OntologyEditor {...props} category={props.section.key} />;
    case "aliases":
      return <AliasEditor {...props} />;
    case "relationships":
    case "credentials":
      return <DeepLinkEditor {...props} />;
    default:
      return null;
  }
};

// ---- Address ----
// Shows the currently-saved address as an inline editable form, plus an
// optional "Find via web/registry" dialog. The user is NOT auto-pushed into
// discovery — they can simply edit what's there and save.
const AddressEditor = ({
  actorId,
  actorName,
  orgNumber,
  website,
  country,
  onDone,
  onChanged,
}: EditorProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    street_address: "",
    postal_code: "",
    city: "",
    region: "",
    country: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCurrent = async () => {
    const { data } = await supabase
      .from("actors")
      .select("street_address, city, region, postal_code, country")
      .eq("id", actorId)
      .maybeSingle();
    setForm({
      street_address: data?.street_address ?? "",
      postal_code: data?.postal_code ?? "",
      city: data?.city ?? "",
      region: data?.region ?? "",
      country: data?.country ?? "",
    });
    setLoaded(true);
  };
  useEffect(() => {
    void loadCurrent();
  }, [actorId]);

  const saveInline = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("actors")
      .update({
        street_address: form.street_address.trim() || null,
        postal_code: form.postal_code.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        country: form.country.trim() || null,
      })
      .eq("id", actorId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Address saved");
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs text-foreground-muted">Street address</Label>
        <Input
          value={form.street_address}
          onChange={(e) => setForm({ ...form, street_address: e.target.value })}
          placeholder="e.g. Storgata 1"
          disabled={!loaded}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-foreground-muted">Postal code</Label>
            <Input
              value={form.postal_code}
              onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              disabled={!loaded}
            />
          </div>
          <div>
            <Label className="text-xs text-foreground-muted">City</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              disabled={!loaded}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-foreground-muted">Region</Label>
            <Input
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              disabled={!loaded}
            />
          </div>
          <div>
            <Label className="text-xs text-foreground-muted">Country</Label>
            <Input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              disabled={!loaded}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveInline} disabled={busy || !loaded} size="sm">
            {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save address
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Search className="w-3 h-3 mr-1" />
            Find via web / registry
          </Button>
        </div>
      </div>

      <AddressDiscoveryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        actorId={actorId}
        actorName={actorName}
        orgNumber={orgNumber}
        website={website}
        country={country}
        onSaved={() => {
          onChanged();
          void loadCurrent();
          setDialogOpen(false);
        }}
      />

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onDone} size="sm">
          Done — next step
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};

// ---- Description ----
// Save as we go, show existing descriptions, support AI generate + manual,
// don't auto-advance.
const DescriptionEditor = ({ actorId, actorName, website, viewerId, onDone, onChanged }: EditorProps) => {
  const resolver = useWebsiteResolver(actorId, actorName, website);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedSource, setGeneratedSource] = useState<string | null>(null);
  const [existing, setExisting] = useState<
    Array<{ id: string; content: string; source: string; source_url: string | null }>
  >([]);

  const loadExisting = async () => {
    const { data } = await supabase
      .from("actor_descriptions")
      .select("id, content, source, source_url")
      .eq("actor_id", actorId)
      .eq("type", "summary")
      .order("created_at", { ascending: false });
    setExisting((data ?? []) as any);
  };
  useEffect(() => {
    void loadExisting();
  }, [actorId]);

  const generate = async () => {
    setGenerating(true);
    try {
      let website_url = resolver.website;
      if (!website_url) {
        const refreshed = await resolver.refresh();
        website_url = refreshed.website;
      }
      if (!website_url) {
        toast.error("Add a website above first.");
        return;
      }
      const { data, error } = await supabase.functions.invoke(
        "generate-actor-summary",
        { body: { actor_id: actorId, website_url, actor_name: actorName } },
      );
      if (error) throw new Error((data as any)?.error ?? error.message);
      const summary = (data as any)?.summary;
      if (!summary) throw new Error("No summary returned");
      setText(summary);
      setGeneratedSource(website_url);
      toast.success("Draft generated — review and save");
    } catch (e: any) {
      toast.error(`Generate failed: ${e?.message ?? "unknown"}`);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (text.trim().length < 10) {
      toast.error("Description must be at least 10 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("actor_descriptions").insert({
      actor_id: actorId,
      type: "summary",
      content: text.trim(),
      source: generatedSource ? "web_search" : "manual",
      source_url: generatedSource,
      verifier_id: viewerId,
      verified_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Description saved");
    setText("");
    setGeneratedSource(null);
    await loadExisting();
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("actor_descriptions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadExisting();
    onChanged();
  };

  return (
    <div className="space-y-3">
      <WebsiteResolverPanel resolver={resolver} />

      {existing.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-foreground-muted">Currently saved</div>
          {existing.map((d) => (
            <div
              key={d.id}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm relative group"
            >
              <div className="text-foreground whitespace-pre-wrap">{d.content}</div>
              <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1">
                {d.source}
                {d.source_url ? ` — ${d.source_url}` : ""}
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 hover:text-destructive"
                aria-label="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label className="text-xs text-foreground-muted">Add a summary</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={generating || busy || !resolver.website}
        >
          {generating ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          Generate from website
        </Button>
      </div>
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (generatedSource) setGeneratedSource(null);
        }}
        placeholder="What does this actor do? Or click 'Generate from website'."
      />
      {generatedSource && (
        <p className="text-[11px] text-foreground-muted">
          Draft generated from {generatedSource}. Edit before saving.
        </p>
      )}
      <Button onClick={save} disabled={busy || generating || !text.trim()} size="sm">
        {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
        Save description
      </Button>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onDone} size="sm">
          Done — next step
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};

// ---- Media (logo / hero) ----
// User-controlled: shows multiple candidates from the website, lets the user
// upload a file or paste a URL, and only advances when the user clicks Done.
const MediaEditor = ({
  actorId,
  actorName,
  website,
  type,
  viewerId,
  onDone,
  onChanged,
}: EditorProps & { type: "logo" | "hero" }) => {
  const resolver = useWebsiteResolver(actorId, actorName, website);
  const [manualUrl, setManualUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [savedUrls, setSavedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Load any already-saved media of this type so the user sees current state.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("actor_media")
        .select("url")
        .eq("actor_id", actorId)
        .eq("type", type);
      if (active) setSavedUrls((data ?? []).map((r) => r.url as string));
    })();
    return () => { active = false; };
  }, [actorId, type]);

  const refreshSaved = async () => {
    const { data } = await supabase
      .from("actor_media")
      .select("url")
      .eq("actor_id", actorId)
      .eq("type", type);
    setSavedUrls((data ?? []).map((r) => r.url as string));
  };

  const findCandidates = async () => {
    setScraping(true);
    try {
      let website_url = resolver.website;
      if (!website_url) {
        const refreshed = await resolver.refresh();
        website_url = refreshed.website;
      }
      if (!website_url) {
        toast.error("Add a website above first.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("scrape-actor-media", {
        body: { actor_id: actorId, website_url, mode: "candidates" },
      });
      if (error) throw new Error((data as any)?.error ?? error.message);
      const list: string[] = (data as any)?.candidates?.[type] ?? [];
      if (list.length === 0) {
        toast.error(`No ${type} candidates found on the website.`);
      }
      setCandidates(list);
    } catch (e: any) {
      toast.error(`Find failed: ${e?.message ?? "unknown"}`);
    } finally {
      setScraping(false);
    }
  };

  const pickCandidate = async (url: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-actor-media", {
        body: { actor_id: actorId, website_url: resolver.website, mode: "ingest", slot: type, url },
      });
      if (error || (data as any)?.ok === false) {
        throw new Error((data as any)?.error ?? error?.message ?? "ingest failed");
      }
      toast.success(`${type} saved`);
      await refreshSaved();
      onChanged();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  };

  const saveManualUrl = async () => {
    if (!manualUrl) {
      toast.error("Paste an image URL first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("actor_media").insert({
      actor_id: actorId,
      type,
      url: manualUrl,
      source: "manual",
      uploaded_by: viewerId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${type} saved`);
    setManualUrl("");
    await refreshSaved();
    onChanged();
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "img";
      const path = `${actorId}/${type}/upload-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("actor-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const publicUrl = supabase.storage.from("actor-media").getPublicUrl(path).data.publicUrl;
      const { error: insErr } = await supabase.from("actor_media").insert({
        actor_id: actorId,
        type,
        url: publicUrl,
        source: "manual",
        uploaded_by: viewerId,
      });
      if (insErr) throw insErr;
      toast.success(`${type} uploaded`);
      await refreshSaved();
      onChanged();
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message ?? "unknown"}`);
    } finally {
      setUploading(false);
    }
  };

  const removeSaved = async (url: string) => {
    setBusy(true);
    const { error } = await supabase
      .from("actor_media")
      .delete()
      .eq("actor_id", actorId)
      .eq("type", type)
      .eq("url", url);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshSaved();
    onChanged();
  };

  return (
    <div className="space-y-4">
      <WebsiteResolverPanel resolver={resolver} />

      {/* Currently saved */}
      {savedUrls.length > 0 && (
        <div>
          <div className="text-xs text-foreground-muted mb-1.5">Currently saved</div>
          <div className="flex flex-wrap gap-2">
            {savedUrls.map((u) => (
              <div key={u} className="relative group">
                <img
                  src={u}
                  alt={`current ${type}`}
                  className="w-20 h-20 object-contain rounded border border-border bg-background p-1"
                />
                <button
                  type="button"
                  onClick={() => removeSaved(u)}
                  disabled={busy}
                  className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Find on website */}
      <div>
        <Button
          onClick={findCandidates}
          disabled={scraping || !resolver.website}
          variant="outline"
          size="sm"
        >
          {scraping ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Search className="w-3 h-3 mr-1" />
          )}
          Find {type} candidates on website
        </Button>
        {candidates.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-foreground-muted mb-1.5">
              Click an image to save it as {type}.
            </div>
            <div className="grid grid-cols-4 gap-2">
              {candidates.map((u) => (
                <button
                  type="button"
                  key={u}
                  onClick={() => pickCandidate(u)}
                  disabled={busy}
                  className="border border-border rounded p-1 bg-background hover:border-primary transition disabled:opacity-50"
                  title={u}
                >
                  <img
                    src={u}
                    alt="candidate"
                    className="w-full h-16 object-contain"
                    onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload from disk */}
      <div>
        <Label className="text-xs text-foreground-muted">Upload from your computer</Label>
        <Input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = "";
          }}
          className="mt-1"
        />
      </div>

      {/* Paste URL */}
      <div>
        <Label className="text-xs text-foreground-muted">Or paste an image URL</Label>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="https://…"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
          />
          <Button onClick={saveManualUrl} disabled={busy || !manualUrl} size="sm">
            Save
          </Button>
        </div>
      </div>

      {/* Explicit advance */}
      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onDone} size="sm" variant="default">
          Done — next step
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};


// ---- Contacts ----
// Save as we go (multiple contacts), show existing, allow auto-scan and
// manual entry, don't auto-advance.
const ContactsEditor = ({ actorId, viewerId, onDone, onChanged }: EditorProps) => {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [existing, setExisting] = useState<
    Array<{ id: string; name: string; title: string | null; email: string | null; phone: string | null; source: string }>
  >([]);

  const loadExisting = async () => {
    const { data } = await supabase
      .from("actor_contacts")
      .select("id, name, title, email, phone, source")
      .eq("actor_id", actorId)
      .order("created_at", { ascending: false });
    setExisting((data ?? []) as any);
  };
  useEffect(() => {
    void loadExisting();
  }, [actorId]);

  const scan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "enrich-from-team-page",
        { body: { actor_id: actorId } },
      );
      if (error) throw new Error(error.message);
      const added = (data as any)?.contacts_added ?? 0;
      if (added > 0) {
        toast.success(`Scanned team page — ${added} contact(s) added`);
        await loadExisting();
        onChanged();
      } else {
        toast.error("Couldn't find any contacts on the team page.");
      }
    } catch (e: any) {
      toast.error(`Scan failed: ${e?.message ?? "unknown"}`);
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("actor_contacts").insert({
      actor_id: actorId,
      name: name.trim(),
      title: title.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      source: "manual",
      verifier_id: viewerId,
      verified_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contact added");
    setName(""); setTitle(""); setEmail(""); setPhone("");
    await loadExisting();
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("actor_contacts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await loadExisting();
    onChanged();
  };

  return (
    <div className="space-y-3">
      {existing.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-foreground-muted">Currently saved ({existing.length})</div>
          {existing.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm group"
            >
              <div>
                <div className="text-foreground font-medium">{c.name}</div>
                {(c.title || c.email || c.phone) && (
                  <div className="text-xs text-foreground-muted">
                    {[c.title, c.email, c.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-wider text-foreground-muted">{c.source}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-destructive"
                aria-label="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button onClick={scan} disabled={scanning} variant="outline" size="sm">
        {scanning ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3 mr-1" />
        )}
        Scan team page
      </Button>

      <div className="text-xs text-foreground-muted">Or add manually:</div>
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Button onClick={save} disabled={busy || !name.trim()} size="sm">
        Add contact
      </Button>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onDone} size="sm">
          Done — next step
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};

// ---- Ontology (capabilities / competences / domains / products / services) ----
// Add multiple tags, show existing, search + pick, don't auto-advance.
const CATEGORY_MAP: Record<string, string> = {
  capabilities: "capability",
  competences: "competence",
  domains: "domain",
  products: "product_type",
  services: "service_type",
};

const OntologyEditor = ({
  actorId,
  category,
  viewerId,
  onDone,
  onChanged,
}: EditorProps & { category: string }) => {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; raw_name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<Array<{ id: string; ontology_entry_id: string; raw_name: string }>>([]);
  const ontologyType = CATEGORY_MAP[category];

  const loadExisting = async () => {
    const { data } = await supabase
      .from("actor_ontology_tags")
      .select("id, ontology_entry_id, ontology_entries!inner(raw_name, ontology_categories!inner(type))")
      .eq("actor_id", actorId)
      .eq("ontology_entries.ontology_categories.type", ontologyType);
    setExisting(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        ontology_entry_id: r.ontology_entry_id,
        raw_name: r.ontology_entries?.raw_name ?? "",
      })),
    );
  };
  useEffect(() => {
    void loadExisting();
  }, [actorId, ontologyType]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ontology_entries")
        .select("id, raw_name, ontology_categories!inner(type)")
        .eq("status", "active")
        .eq("ontology_categories.type", ontologyType)
        .ilike("raw_name", query ? `%${query}%` : "%")
        .order("sort_order")
        .limit(15);
      if (!cancelled) setOptions((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [query, ontologyType]);

  const pick = async (entry: { id: string; raw_name: string }) => {
    if (existing.some((e) => e.ontology_entry_id === entry.id)) {
      toast.error("Already added.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("actor_ontology_tags").insert({
      actor_id: actorId,
      ontology_entry_id: entry.id,
      source: "manual",
      confidence: "high",
      accepted_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added "${entry.raw_name}"`);
    await loadExisting();
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("actor_ontology_tags").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await loadExisting();
    onChanged();
  };

  return (
    <div className="space-y-3">
      {existing.length > 0 && (
        <div>
          <div className="text-xs text-foreground-muted mb-1.5">
            Currently saved ({existing.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {existing.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-foreground"
              >
                {e.raw_name}
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  className="hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <Label className="text-xs text-foreground-muted">
        Find a {category.replace(/s$/, "")} to add
      </Label>
      <Input
        placeholder="Search ontology…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="border border-border rounded-md max-h-60 overflow-y-auto bg-surface">
        {options.length === 0 ? (
          <div className="text-xs text-foreground-muted p-3">No matches.</div>
        ) : (
          options.map((o) => {
            const already = existing.some((e) => e.ontology_entry_id === o.id);
            return (
              <button
                key={o.id}
                disabled={busy || already}
                onClick={() => pick(o)}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-elevated text-foreground disabled:opacity-40"
              >
                {o.raw_name} {already && <span className="text-[10px] text-foreground-muted">· added</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onDone} size="sm">
          Done — next step
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};

// ---- Aliases ----
// Add multiple, show existing, don't auto-advance.
const AliasEditor = ({ actorId, viewerId, onDone, onChanged }: EditorProps) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<Array<{ id: string; alias_name: string; alias_type: string | null }>>([]);

  const loadExisting = async () => {
    const { data } = await supabase
      .from("actor_aliases")
      .select("id, alias_name, alias_type")
      .eq("actor_id", actorId)
      .order("created_at", { ascending: false });
    setExisting((data ?? []) as any);
  };
  useEffect(() => {
    void loadExisting();
  }, [actorId]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("actor_aliases").insert({
      actor_id: actorId,
      alias_name: name.trim(),
      created_by: viewerId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Alias added");
    setName("");
    await loadExisting();
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("actor_aliases").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await loadExisting();
    onChanged();
  };

  return (
    <div className="space-y-3">
      {existing.length > 0 && (
        <div>
          <div className="text-xs text-foreground-muted mb-1.5">Currently saved</div>
          <div className="flex flex-wrap gap-1.5">
            {existing.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-foreground"
              >
                {a.alias_name}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <Label className="text-xs text-foreground-muted">Alias name</Label>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          placeholder="e.g. trading name, abbreviation"
        />
        <Button onClick={save} disabled={busy || !name.trim()} size="sm">
          Add
        </Button>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onDone} size="sm">
          Done — next step
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};

// ---- Deep-link (relationships / credentials) ----
const DeepLinkEditor = ({ section, onDone }: EditorProps) => (
  <div className="space-y-3 text-sm text-foreground-secondary">
    <p>
      Open the {section.cardLabel} card on the actor profile to add{" "}
      {section.label.toLowerCase()}. Once added, return here and continue the wizard.
    </p>
    <Button variant="outline" onClick={onDone}>
      I've added it — continue
    </Button>
  </div>
);

export default CompleteCardWizard;
