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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import AddressDiscoveryDialog from "./AddressDiscoveryDialog";

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

  // Initialise keep map from sections.
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
  }, [open, sections]);

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
const AddressEditor = ({
  actorId,
  actorName,
  orgNumber,
  website,
  country,
  onDone,
  onChanged,
}: EditorProps) => {
  const [open, setOpen] = useState(true);
  return (
    <AddressDiscoveryDialog
      open={open}
      onClose={() => setOpen(false)}
      actorId={actorId}
      actorName={actorName}
      orgNumber={orgNumber}
      website={website}
      country={country}
      onSaved={() => {
        onChanged();
        onDone();
      }}
    />
  );
};

// ---- Description ----
const DescriptionEditor = ({ actorId, viewerId, onDone, onChanged }: EditorProps) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
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
      source: "manual",
      verifier_id: viewerId,
      verified_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Description saved");
    onChanged();
    onDone();
  };
  return (
    <div className="space-y-3">
      <Label className="text-xs text-foreground-muted">Summary</Label>
      <Textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What does this actor do?"
      />
      <Button onClick={save} disabled={busy}>
        {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
        Save description
      </Button>
    </div>
  );
};

// ---- Media (logo / hero) ----
const MediaEditor = ({
  actorId,
  type,
  viewerId,
  onDone,
  onChanged,
}: EditorProps & { type: "logo" | "hero" }) => {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [scraping, setScraping] = useState(false);

  const scrape = async () => {
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-actor-media", {
        body: { actor_id: actorId },
      });
      if (error) throw new Error(error.message);
      const found = (data as any)?.[`${type}_url`] ?? null;
      if (found) {
        toast.success(`${type} found and saved`);
        onChanged();
        onDone();
      } else {
        toast.error(`No ${type} found on the website. Add manually below.`);
      }
    } catch (e: any) {
      toast.error(`Scrape failed: ${e?.message ?? "unknown"}`);
    } finally {
      setScraping(false);
    }
  };

  const saveManual = async () => {
    if (!url) {
      toast.error("Paste an image URL first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("actor_media").insert({
      actor_id: actorId,
      type,
      url,
      source: "manual",
      uploaded_by: viewerId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${type} saved`);
    onChanged();
    onDone();
  };

  return (
    <div className="space-y-3">
      <Button onClick={scrape} disabled={scraping} variant="outline">
        {scraping ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3 mr-1" />
        )}
        Scrape {type} from website
      </Button>
      <div className="text-xs text-foreground-muted">or paste a URL:</div>
      <Input
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button onClick={saveManual} disabled={busy}>
        Save {type}
      </Button>
    </div>
  );
};

// ---- Contacts ----
const ContactsEditor = ({ actorId, viewerId, onDone, onChanged }: EditorProps) => {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

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
        onChanged();
        onDone();
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
    onChanged();
    onDone();
  };

  return (
    <div className="space-y-3">
      <Button onClick={scan} disabled={scanning} variant="outline">
        {scanning ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3 mr-1" />
        )}
        Scan team page
      </Button>
      <div className="text-xs text-foreground-muted">or add manually:</div>
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button onClick={save} disabled={busy}>
        Add contact
      </Button>
    </div>
  );
};

// ---- Ontology (capabilities / competences / domains / products / services) ----
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
  const ontologyType = CATEGORY_MAP[category];

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
    return () => {
      cancelled = true;
    };
  }, [query, ontologyType]);

  const pick = async (entry: { id: string; raw_name: string }) => {
    setBusy(true);
    const { error } = await supabase.from("actor_ontology_tags").insert({
      actor_id: actorId,
      ontology_entry_id: entry.id,
      source: "manual",
      confidence: "high",
      accepted_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Added "${entry.raw_name}"`);
    onChanged();
    onDone();
  };

  return (
    <div className="space-y-3">
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
          options.map((o) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => pick(o)}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-elevated text-foreground"
            >
              {o.raw_name}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

// ---- Aliases ----
const AliasEditor = ({ actorId, viewerId, onDone, onChanged }: EditorProps) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("actor_aliases").insert({
      actor_id: actorId,
      alias_name: name.trim(),
      created_by: viewerId,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Alias added");
    onChanged();
    onDone();
  };
  return (
    <div className="space-y-3">
      <Label className="text-xs text-foreground-muted">Alias name</Label>
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Button onClick={save} disabled={busy}>
        Add alias
      </Button>
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
