import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Globe,
  ShieldCheck,
  AlertCircle,
  Pencil,
  Check,
  X as XIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActorActions } from "@/hooks/useActorActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TagInput } from "@/components/nexus/TagInput";
import { ConfirmActorActionDialog } from "@/components/nexus/ConfirmActorActionDialog";
import { EnrichmentToolbar } from "@/components/nexus/EnrichmentToolbar";
import { UrlEnrichmentPanel } from "@/components/nexus/UrlEnrichmentPanel";
import { RegistryEnrichmentPanel } from "@/components/nexus/RegistryEnrichmentPanel";
import { DocumentEnrichmentPanel } from "@/components/nexus/DocumentEnrichmentPanel";
import { WebSearchEnrichmentPanel } from "@/components/nexus/WebSearchEnrichmentPanel";
import { OntologyEntryList } from "@/components/nexus/OntologyEntryList";
import { appendManualOntologyItems } from "@/lib/actorEnrichment";
import {
  readOntologyEntries,
  type DisplayEntry,
} from "@/lib/readOntologyEntries";
import type { EnrichmentAcceptedItem } from "@/types/enrichment";
import type { SectionKey } from "@/config/enrichmentMethods";
import type { PersonalActor } from "@/types/personal-actor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Source = "personal" | "database";

interface DbActor {
  id: string;
  legal_name: string;
  trade_names: string[] | null;
  org_number: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  street_address: string | null;
  websites: string[] | null;
  verification_status: string;
  source: string;
  data_completeness: string[] | null;
  created_at: string;
  updated_at: string;
}

interface OntologyTagRow {
  id: string;
  ontology_entry_id: string;
  source: string;
  ontology_entries: {
    id: string;
    raw_name: string;
    category_id: string | null;
    ontology_categories: {
      type: string;
      normalized_name: string;
    } | null;
  } | null;
}

const TYPE_BADGE: Record<string, string> = {
  commercial: "bg-success/15 text-success border-success/30",
  government: "bg-info/15 text-info border-info/30",
  academic: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
  industry_body: "bg-warning/15 text-warning border-warning/30",
};

const TYPE_LABEL: Record<string, string> = {
  commercial: "Commercial",
  government: "Government",
  academic: "Academic",
  industry_body: "Industry Body",
};

function formatDate(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

// (Ontology JSONB normalization moved to src/lib/readOntologyEntries.ts.)

interface SectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  /** Optional extra header content (e.g. EnrichmentToolbar) — placed between count and chevron. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

function ProfileSection({
  title,
  count,
  defaultOpen = true,
  headerExtra,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/60 py-4">
      <div className="flex w-full items-center justify-between gap-2 group">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-between text-left"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-foreground-secondary group-hover:text-foreground transition-colors">
            {title}
            {count != null && (
              <span className="ml-2 text-foreground-muted normal-case font-normal">
                ({count})
              </span>
            )}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {headerExtra}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn("w-4 h-4 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
      </div>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, 5);
  const hiddenCount = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((it, i) => (
        <span
          key={`${it}-${i}`}
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-surface border border-border/60 text-foreground"
        >
          {it}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-elevated border border-border/60 text-foreground-secondary hover:text-foreground hover:border-border-accent transition-colors"
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && items.length > 5 && (
        <button
          onClick={() => setExpanded(false)}
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs text-foreground-muted hover:text-foreground transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}

function IdentityRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" ||
      (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1">
        {label}
      </div>
      <div className="text-sm text-foreground break-words">{value}</div>
    </div>
  );
}

interface IdentityEditFormProps {
  draft: {
    actor_name: string;
    trade_names: string[];
    org_number: string;
    street_address: string;
    city: string;
    region: string;
    country: string;
    actor_website: string;
    actor_type: string;
  };
  onChange: React.Dispatch<
    React.SetStateAction<IdentityEditFormProps["draft"] | null>
  >;
  errors: { actor_name?: string; actor_website?: string };
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider text-foreground-muted mb-1.5">
      {children}
    </label>
  );
}

function IdentityEditForm({
  draft,
  onChange,
  errors,
  onSave,
  onCancel,
  saving,
}: IdentityEditFormProps) {
  const update = <K extends keyof IdentityEditFormProps["draft"]>(
    key: K,
    value: IdentityEditFormProps["draft"][K],
  ) => {
    onChange((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Legal name *</FieldLabel>
        <Input
          value={draft.actor_name}
          onChange={(e) => update("actor_name", e.target.value)}
          placeholder="Acme Corporation AS"
          aria-invalid={Boolean(errors.actor_name)}
        />
        {errors.actor_name && (
          <p className="text-xs text-destructive mt-1">{errors.actor_name}</p>
        )}
      </div>

      <div>
        <FieldLabel>Trade names</FieldLabel>
        <div className="bg-elevated border border-border rounded-md p-2">
          <TagInput
            tags={draft.trade_names}
            onChange={(t) => update("trade_names", t)}
            placeholder="Add trade name and press Enter…"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Org number</FieldLabel>
          <Input
            value={draft.org_number}
            onChange={(e) => update("org_number", e.target.value)}
            placeholder="e.g. 123 456 789"
          />
        </div>
        <div>
          <FieldLabel>Type</FieldLabel>
          <Select
            value={draft.actor_type}
            onValueChange={(v) => update("actor_type", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="government">Government</SelectItem>
              <SelectItem value="academic">Academic</SelectItem>
              <SelectItem value="industry_body">Industry Body</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <FieldLabel>Street address</FieldLabel>
        <Input
          value={draft.street_address}
          onChange={(e) => update("street_address", e.target.value)}
          placeholder="Storgata 1"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <FieldLabel>City</FieldLabel>
          <Input
            value={draft.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Oslo"
          />
        </div>
        <div>
          <FieldLabel>Region</FieldLabel>
          <Input
            value={draft.region}
            onChange={(e) => update("region", e.target.value)}
            placeholder="Oslo"
          />
        </div>
        <div>
          <FieldLabel>Country</FieldLabel>
          <Input
            value={draft.country}
            onChange={(e) => update("country", e.target.value)}
            placeholder="Norway"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Website</FieldLabel>
        <Input
          value={draft.actor_website}
          onChange={(e) => update("actor_website", e.target.value)}
          placeholder="https://example.com"
          aria-invalid={Boolean(errors.actor_website)}
        />
        {errors.actor_website && (
          <p className="text-xs text-destructive mt-1">{errors.actor_website}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <XIcon className="w-3.5 h-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function DisabledAction({ label, tip = "Coming soon" }: { label: string; tip?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="secondary" size="sm" disabled className="cursor-not-allowed">
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const ActorProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source | null>(null);
  const [personal, setPersonal] = useState<PersonalActor | null>(null);
  const [dbActor, setDbActor] = useState<DbActor | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // DB satellite data
  const [contacts, setContacts] = useState<any[]>([]);
  const [ontologyTags, setOntologyTags] = useState<OntologyTagRow[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [standards, setStandards] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [descriptions, setDescriptions] = useState<any[]>([]);

  // Inline editors
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);

  // Identity edit mode
  type IdentityDraft = {
    actor_name: string;
    trade_names: string[];
    org_number: string;
    street_address: string;
    city: string;
    region: string;
    country: string;
    actor_website: string;
    actor_type: string;
  };
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft | null>(null);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityErrors, setIdentityErrors] = useState<{ actor_name?: string; actor_website?: string }>({});

  // Manual ontology entry — which ontology section is in add mode + the draft
  type OntologyKey = "capabilities" | "competences" | "domains" | "products" | "services";
  const [addingOntology, setAddingOntology] = useState<OntologyKey | null>(null);
  const [ontologyDraft, setOntologyDraft] = useState<string[]>([]);
  const [savingOntology, setSavingOntology] = useState(false);

  // URL-scrape mode — at most one section can host the panel at a time.
  const [urlScrapeSection, setUrlScrapeSection] = useState<OntologyKey | null>(null);

  // Document upload mode — at most one section can host the panel at a time.
  const [uploadDocSection, setUploadDocSection] = useState<OntologyKey | null>(
    null,
  );

  // Web search mode — at most one section can host the panel at a time.
  const [webSearchSection, setWebSearchSection] = useState<OntologyKey | null>(
    null,
  );

  // Registry lookup — Identity-only, so a boolean suffices.
  const [registrySectionOpen, setRegistrySectionOpen] = useState(false);

  // Confirm dialogs
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { busy, updateNotes, updateTags, suggestForDb, deleteFromCollection } =
    useActorActions();

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setSource(null);
      setPersonal(null);
      setDbActor(null);

      // Check admin role
      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setIsAdmin(userRow?.role === "admin");

      // Try personal first
      const { data: pa } = await supabase
        .from("user_personal_actors")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (pa) {
        setPersonal(pa as unknown as PersonalActor);
        setSource("personal");

        if (pa.source_session_id) {
          const { data: s } = await supabase
            .from("search_sessions")
            .select("name, created_at")
            .eq("id", pa.source_session_id)
            .maybeSingle();
          if (!cancelled) setSessionName(s?.name ?? null);
        }
        setLoading(false);
        return;
      }

      // Try DB actor
      const { data: da } = await supabase
        .from("actors")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;

      if (da) {
        setDbActor(da as unknown as DbActor);
        setSource("database");

        const [contactsRes, tagsRes, classRes, stdRes, custRes, descRes] =
          await Promise.all([
            supabase.from("actor_contacts").select("*").eq("actor_id", id),
            supabase
              .from("actor_ontology_tags")
              .select(
                "id, ontology_entry_id, source, ontology_entries(id, raw_name, category_id, ontology_categories(type, normalized_name))",
              )
              .eq("actor_id", id),
            supabase.from("actor_classifications").select("*").eq("actor_id", id),
            supabase.from("actor_standards").select("*").eq("actor_id", id),
            supabase.from("actor_customer_history").select("*").eq("actor_id", id),
            supabase.from("actor_descriptions").select("*").eq("actor_id", id),
          ]);

        if (cancelled) return;
        setContacts(contactsRes.data ?? []);
        setOntologyTags((tagsRes.data ?? []) as unknown as OntologyTagRow[]);
        setClassifications(classRes.data ?? []);
        setStandards(stdRes.data ?? []);
        setCustomers(custRes.data ?? []);
        setDescriptions(descRes.data ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  // Derive ontology lists per source.
  // For personal actors we keep both: a flat string[] (for count + dedup)
  // and a DisplayEntry[] (for click-to-expand metadata rendering).
  const personalOntologyEntries = useMemo(() => {
    if (source !== "personal" || !personal) {
      return {
        capabilities: [] as DisplayEntry[],
        competences: [] as DisplayEntry[],
        domains: [] as DisplayEntry[],
        products: [] as DisplayEntry[],
        services: [] as DisplayEntry[],
      };
    }
    const ad = (personal.analysis_data ?? {}) as Record<string, unknown>;
    return {
      capabilities: readOntologyEntries(ad.capabilities),
      competences: readOntologyEntries(ad.competences),
      domains: readOntologyEntries(ad.domains),
      products: readOntologyEntries(ad.products),
      services: readOntologyEntries(ad.services),
    };
  }, [source, personal]);

  const ontology = useMemo(() => {
    if (source === "personal" && personal) {
      return {
        capabilities: personalOntologyEntries.capabilities.map((e) => e.name),
        competences: personalOntologyEntries.competences.map((e) => e.name),
        domains: personalOntologyEntries.domains.map((e) => e.name),
        products: personalOntologyEntries.products.map((e) => e.name),
        services: personalOntologyEntries.services.map((e) => e.name),
      };
    }
    if (source === "database") {
      const byType = (t: string) =>
        ontologyTags
          .filter((x) => x.ontology_entries?.ontology_categories?.type === t)
          .map((x) => x.ontology_entries?.raw_name ?? "")
          .filter(Boolean);
      return {
        capabilities: byType("capability"),
        competences: byType("competence"),
        domains: byType("domain"),
        products: byType("product_type"),
        services: byType("service_type"),
      };
    }
    return { capabilities: [], competences: [], domains: [], products: [], services: [] };
  }, [source, personal, personalOntologyEntries, ontologyTags]);

  // Derive classification / standards / customers from JSONB for personal
  const personalDerived = useMemo(() => {
    if (!personal) return { classification: [], standards: [], customers: [] };
    const ad = (personal.analysis_data ?? {}) as Record<string, unknown>;
    const sd = (personal.search_data ?? {}) as Record<string, unknown>;
    const classification =
      (Array.isArray(ad.classification) && (ad.classification as any[])) ||
      (ad.classification && typeof ad.classification === "object"
        ? [ad.classification]
        : []) ||
      (Array.isArray(sd.classification_found) ? (sd.classification_found as any[]) : []);
    const standards =
      (Array.isArray(ad.standards) && (ad.standards as any[])) ||
      (Array.isArray(sd.standards_found) ? (sd.standards_found as any[]) : []);
    const customers =
      (Array.isArray(ad.customers) && (ad.customers as any[])) ||
      (Array.isArray(ad.customer_references)
        ? (ad.customer_references as any[])
        : []) ||
      (Array.isArray(ad.customer_history) ? (ad.customer_history as any[]) : []);
    return { classification, standards, customers };
  }, [personal]);

  // ---------- Manual ontology entry ----------
  const isPersonal = source === "personal" && Boolean(personal);

  const openOntologyAdd = (key: OntologyKey) => {
    setUrlScrapeSection(null);
    setUploadDocSection(null);
    setWebSearchSection(null);
    setRegistrySectionOpen(false);
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityErrors({});
    setOntologyDraft([]);
    setAddingOntology(key);
  };

  const cancelOntologyAdd = () => {
    setAddingOntology(null);
    setOntologyDraft([]);
  };

  const openUrlScrape = (key: OntologyKey) => {
    setAddingOntology(null);
    setOntologyDraft([]);
    setUploadDocSection(null);
    setWebSearchSection(null);
    setRegistrySectionOpen(false);
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityErrors({});
    setUrlScrapeSection(key);
  };

  const openUploadDoc = (key: OntologyKey) => {
    setAddingOntology(null);
    setOntologyDraft([]);
    setUrlScrapeSection(null);
    setWebSearchSection(null);
    setRegistrySectionOpen(false);
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityErrors({});
    setUploadDocSection(key);
  };

  const openWebSearch = (key: OntologyKey) => {
    setAddingOntology(null);
    setOntologyDraft([]);
    setUrlScrapeSection(null);
    setUploadDocSection(null);
    setRegistrySectionOpen(false);
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityErrors({});
    setWebSearchSection(key);
  };

  // ---------- Identity edit ----------
  const openIdentityEdit = () => {
    if (!personal) return;
    setAddingOntology(null);
    setOntologyDraft([]);
    setUrlScrapeSection(null);
    setUploadDocSection(null);
    setWebSearchSection(null);
    setRegistrySectionOpen(false);
    setIdentityErrors({});
    setIdentityDraft({
      actor_name: personal.actor_name ?? "",
      trade_names: personal.trade_names ?? [],
      org_number: personal.org_number ?? "",
      street_address: personal.street_address ?? "",
      city: personal.city ?? "",
      region: personal.region ?? "",
      country: personal.country ?? "",
      actor_website: personal.actor_website ?? "",
      actor_type: personal.actor_type ?? "commercial",
    });
    setEditingIdentity(true);
  };

  // ---------- Registry lookup ----------
  const openRegistryLookup = () => {
    if (!personal) return;
    setAddingOntology(null);
    setOntologyDraft([]);
    setUrlScrapeSection(null);
    setUploadDocSection(null);
    setWebSearchSection(null);
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityErrors({});
    setRegistrySectionOpen(true);
  };

  const cancelIdentityEdit = () => {
    setEditingIdentity(false);
    setIdentityDraft(null);
    setIdentityErrors({});
  };

  const saveIdentityEdit = async () => {
    if (!personal || !identityDraft) return;
    const draft = identityDraft;
    const errors: { actor_name?: string; actor_website?: string } = {};
    const name = draft.actor_name.trim();
    if (!name) errors.actor_name = "Legal name is required";
    const website = draft.actor_website.trim();
    if (website && !/^https?:\/\//i.test(website)) {
      errors.actor_website = "Must start with http:// or https://";
    }
    if (Object.keys(errors).length > 0) {
      setIdentityErrors(errors);
      return;
    }
    setIdentityErrors({});

    const trimOrNull = (s: string) => {
      const v = s.trim();
      return v === "" ? null : v;
    };
    const update = {
      actor_name: name,
      trade_names: draft.trade_names.map((t) => t.trim()).filter(Boolean),
      org_number: trimOrNull(draft.org_number),
      street_address: trimOrNull(draft.street_address),
      city: trimOrNull(draft.city),
      region: trimOrNull(draft.region),
      country: trimOrNull(draft.country),
      actor_website: trimOrNull(draft.actor_website),
      actor_type: draft.actor_type,
    };

    setSavingIdentity(true);
    try {
      const { error } = await supabase
        .from("user_personal_actors")
        .update(update)
        .eq("id", personal.id);
      if (error) throw error;
      setPersonal((prev) => (prev ? { ...prev, ...update } : prev));
      toast.success("Identity updated");
      setEditingIdentity(false);
      setIdentityDraft(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update identity");
    } finally {
      setSavingIdentity(false);
    }
  };

  const saveOntologyAdd = async () => {
    if (!personal || !addingOntology) return;
    const sectionLabel: Record<OntologyKey, string> = {
      capabilities: "Capabilities",
      competences: "Competences",
      domains: "Domains",
      products: "Products",
      services: "Services",
    };
    const cleaned = ontologyDraft.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      cancelOntologyAdd();
      return;
    }
    setSavingOntology(true);
    try {
      const current = (personal.analysis_data ?? {}) as Record<string, unknown>;
      const beforeCount = Array.isArray(current[addingOntology])
        ? (current[addingOntology] as unknown[]).length
        : 0;
      const nowIso = new Date().toISOString();
      const items: EnrichmentAcceptedItem[] = cleaned.map((entry_name) => ({
        entry_name,
        source: "manual",
        accepted_at: nowIso,
      }));
      const merged = appendManualOntologyItems(current[addingOntology], items);
      const added = merged.length - beforeCount;
      const nextAnalysis = { ...current, [addingOntology]: merged };

      const { error } = await supabase
        .from("user_personal_actors")
        .update({ analysis_data: nextAnalysis as never })
        .eq("id", personal.id);
      if (error) throw error;

      setPersonal({ ...personal, analysis_data: nextAnalysis });
      toast.success(
        added > 0
          ? `Added ${added} item${added === 1 ? "" : "s"} to ${sectionLabel[addingOntology]}`
          : "No new items added (duplicates skipped)",
      );
      cancelOntologyAdd();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save items");
    } finally {
      setSavingOntology(false);
    }
  };

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // ---------- Not found ----------
  if (!personal && !dbActor) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-foreground-muted" />
          <h2 className="text-lg font-medium mb-2 text-foreground">Actor not found</h2>
          <p className="text-foreground-secondary text-sm mb-6">
            This actor may have been deleted or you don't have access to view it.
          </p>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/actors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Actors
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Header values ----------
  const name = personal?.actor_name ?? dbActor?.legal_name ?? "Untitled actor";
  const description =
    personal?.actor_description ??
    descriptions.find((d) => d.type === "summary")?.content ??
    descriptions[0]?.content ??
    null;
  const country = personal?.country ?? dbActor?.country ?? null;
  const actorType = personal?.actor_type ?? null;
  const website = personal?.actor_website ?? dbActor?.websites?.[0] ?? null;
  const verification = dbActor?.verification_status ?? null;

  const tradeNames = personal?.trade_names?.length
    ? personal.trade_names
    : dbActor?.trade_names ?? [];
  const orgNumber = personal?.org_number ?? dbActor?.org_number ?? null;
  const streetAddress = personal?.street_address ?? dbActor?.street_address ?? null;
  const city = personal?.city ?? dbActor?.city ?? null;
  const region = personal?.region ?? dbActor?.region ?? null;
  const addressComposed = [streetAddress, city, region].filter(Boolean).join(", ") || null;

  const hasIdentity = Boolean(
    name ||
      country ||
      orgNumber ||
      tradeNames.length ||
      addressComposed ||
      website ||
      actorType,
  );

  // ---------- Render ----------
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        {/* Back */}
        <button
          onClick={() => navigate("/actors")}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Actors
        </button>

        {/* Header card */}
        <div className="bg-surface border border-border rounded-lg p-6 mb-2">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {name}
            </h1>
          </div>
          {description && (
            <p className="text-sm text-foreground-secondary leading-relaxed mb-4">
              {description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {country && (
              <span className="text-xs text-foreground-muted">{country}</span>
            )}
            {actorType && (
              <Badge
                variant="outline"
                className={cn("text-[10px] font-medium uppercase tracking-wider", TYPE_BADGE[actorType])}
              >
                {TYPE_LABEL[actorType] ?? actorType}
              </Badge>
            )}
            {verification && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wider gap-1",
                  verification === "admin_verified" &&
                    "bg-info/15 text-info border-info/30",
                  verification === "verified" &&
                    "bg-success/15 text-success border-success/30",
                  verification === "unverified" &&
                    "bg-warning/15 text-warning border-warning/30",
                )}
              >
                <ShieldCheck className="w-3 h-3" />
                {verification === "admin_verified"
                  ? "Admin Verified"
                  : verification === "verified"
                    ? "Verified"
                    : "Unverified"}
              </Badge>
            )}
            {personal?.matched_main_db_actor_id && (
              <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30">
                Matched to DB
              </Badge>
            )}
            {personal?.status === "suggested" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium uppercase tracking-wider bg-warning/15 text-warning border-warning/30"
                    >
                      Pending review
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Suggested for main database — awaiting admin review
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {personal?.status === "merged" && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium uppercase tracking-wider bg-success/15 text-success border-success/30"
                    >
                      In main database
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    This actor is now part of the main database
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-accent-teal hover:underline mt-4"
            >
              <Globe className="w-3.5 h-3.5" />
              {website.replace(/^https?:\/\//, "")}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Tags (personal actors only) */}
        {source === "personal" && personal && (
          <ProfileSection title="Tags">
            {editingTags ? (
              <div className="space-y-3">
                <div className="bg-elevated border border-border rounded-md p-2">
                  <TagInput
                    tags={tagsDraft}
                    onChange={setTagsDraft}
                    placeholder="Add tag and press Enter…"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const ok = await updateTags(personal.id, tagsDraft);
                      if (ok) {
                        setPersonal({ ...personal, tags: tagsDraft });
                        setEditingTags(false);
                      }
                    }}
                    disabled={busy === "tags"}
                  >
                    <Check className="w-3.5 h-3.5" /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTags(false)}
                  >
                    <XIcon className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                {personal.tags && personal.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {personal.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-surface border border-border/60 text-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setTagsDraft([]);
                      setEditingTags(true);
                    }}
                    className="text-sm text-foreground-muted hover:text-foreground transition-colors"
                  >
                    Add tags
                  </button>
                )}
                {personal.tags && personal.tags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      setTagsDraft(personal.tags ?? []);
                      setEditingTags(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
          </ProfileSection>
        )}

        {/* Sections */}
        {hasIdentity && (
          <ProfileSection
            title="Identity"
            headerExtra={
              isPersonal ? (
                <EnrichmentToolbar
                  sectionKey="identity"
                  onManualClick={openIdentityEdit}
                  onRegistryClick={openRegistryLookup}
                />
              ) : undefined
            }
          >
            {editingIdentity && identityDraft ? (
              <IdentityEditForm
                draft={identityDraft}
                onChange={setIdentityDraft}
                errors={identityErrors}
                onSave={saveIdentityEdit}
                onCancel={cancelIdentityEdit}
                saving={savingIdentity}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <IdentityRow label="Legal name" value={name} />
                {tradeNames.length > 0 && (
                  <IdentityRow label="Trade names" value={tradeNames.join(", ")} />
                )}
                <IdentityRow label="Org number" value={orgNumber} />
                <IdentityRow label="Country" value={country} />
                <IdentityRow label="Address" value={addressComposed} />
                {actorType && (
                  <IdentityRow label="Type" value={TYPE_LABEL[actorType] ?? actorType} />
                )}
                {website && <IdentityRow label="Website" value={website} />}
              </div>
            )}
            {registrySectionOpen && isPersonal && personal && (
              <RegistryEnrichmentPanel
                actorId={personal.id}
                currentIdentity={{
                  actor_name: personal.actor_name ?? null,
                  org_number: personal.org_number ?? null,
                  street_address: personal.street_address ?? null,
                  city: personal.city ?? null,
                  region: personal.region ?? null,
                  country: personal.country ?? null,
                  actor_website: personal.actor_website ?? null,
                }}
                onClose={() => setRegistrySectionOpen(false)}
                onFieldAccepted={(field, value) => {
                  setPersonal((prev) =>
                    prev ? { ...prev, [field]: value } : prev,
                  );
                }}
              />
            )}
          </ProfileSection>
        )}

        {/* Ontology sections — always render for personal actors (with toolbar). DB actors only render when populated. */}
        {(["capabilities", "competences", "domains", "products", "services"] as const).map((key) => {
          const items = ontology[key];
          const titles: Record<typeof key, string> = {
            capabilities: "Capabilities",
            competences: "Competences",
            domains: "Domains",
            products: "Products",
            services: "Services",
          };
          if (!isPersonal && items.length === 0) return null;

          const isAdding = addingOntology === key;
          const isUrlScrape = urlScrapeSection === key;
          const isUploadDoc = uploadDocSection === key;
          const isWebSearch = webSearchSection === key;
          return (
            <ProfileSection
              key={key}
              title={titles[key]}
              count={items.length > 0 ? items.length : undefined}
              headerExtra={
                isPersonal ? (
                  <EnrichmentToolbar
                    sectionKey={key as SectionKey}
                    onManualClick={() => openOntologyAdd(key)}
                    onUrlScrapeClick={() => openUrlScrape(key)}
                    onUploadDocClick={() => openUploadDoc(key)}
                    onWebSearchClick={() => openWebSearch(key)}
                  />
                ) : undefined
              }
            >
              {items.length > 0 ? (
                isPersonal ? (
                  <OntologyEntryList entries={personalOntologyEntries[key]} />
                ) : (
                  <TagList items={items} />
                )
              ) : (
                !isAdding &&
                !isUrlScrape &&
                !isUploadDoc &&
                !isWebSearch && (
                  <p className="text-sm text-foreground-muted">
                    No items yet. Use the toolbar to add.
                  </p>
                )
              )}
              {isAdding && (
                <div className="mt-3 space-y-3">
                  <div className="bg-elevated border border-border rounded-md p-2">
                    <TagInput
                      tags={ontologyDraft}
                      onChange={setOntologyDraft}
                      placeholder={`Add ${titles[key].toLowerCase()} and press Enter…`}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveOntologyAdd} disabled={savingOntology}>
                      <Check className="w-3.5 h-3.5" /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cancelOntologyAdd}
                      disabled={savingOntology}
                    >
                      <XIcon className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              )}
              {isUrlScrape && personal && (
                <UrlEnrichmentPanel
                  actorId={personal.id}
                  sectionKey={key}
                  sectionTitle={titles[key]}
                  actorContext={{
                    actor_name: personal.actor_name,
                    actor_description: personal.actor_description,
                    country: personal.country,
                    actor_website: personal.actor_website,
                  }}
                  existingItems={items}
                  currentAnalysisData={personal.analysis_data}
                  onClose={() => setUrlScrapeSection(null)}
                  onItemAccepted={(_item, nextAnalysis) => {
                    setPersonal({ ...personal, analysis_data: nextAnalysis });
                  }}
                />
              )}
              {isUploadDoc && personal && (
                <DocumentEnrichmentPanel
                  actorId={personal.id}
                  sectionKey={key}
                  sectionTitle={titles[key]}
                  actorContext={{
                    actor_name: personal.actor_name,
                    actor_description: personal.actor_description,
                    country: personal.country,
                  }}
                  existingItems={items}
                  currentAnalysisData={personal.analysis_data}
                  onClose={() => setUploadDocSection(null)}
                  onItemAccepted={(_item, nextAnalysis) => {
                    setPersonal({ ...personal, analysis_data: nextAnalysis });
                  }}
                />
              )}
              {isWebSearch && personal && (
                <WebSearchEnrichmentPanel
                  actorId={personal.id}
                  sectionKey={key}
                  sectionTitle={titles[key]}
                  actorContext={{
                    actor_name: personal.actor_name,
                    actor_description: personal.actor_description,
                    country: personal.country,
                  }}
                  existingItems={items}
                  currentAnalysisData={personal.analysis_data}
                  onClose={() => setWebSearchSection(null)}
                  onItemAccepted={(_item, nextAnalysis) => {
                    setPersonal({ ...personal, analysis_data: nextAnalysis });
                  }}
                />
              )}
            </ProfileSection>
          );
        })}

        {/* Classification */}
        {(source === "database" ? classifications : personalDerived.classification).length > 0 && (
          <ProfileSection
            title="Security Classification"
            headerExtra={isPersonal ? <EnrichmentToolbar sectionKey="classification" /> : undefined}
          >
            <div className="space-y-3">
              {(source === "database" ? classifications : personalDerived.classification).map(
                (c: any, i: number) => (
                  <div
                    key={i}
                    className="bg-surface border border-border/60 rounded-md p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">
                        {c.classification_system ?? c.system ?? "Classification"}
                      </span>
                      {(c.level_normalized || c.level) && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {c.level_national_term ?? c.level_normalized ?? c.level}
                        </Badge>
                      )}
                      {c.confidence && (
                        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                          {c.confidence}
                        </span>
                      )}
                    </div>
                    {c.evidence && (
                      <p className="text-xs text-foreground-secondary leading-relaxed">
                        {c.evidence}
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>
          </ProfileSection>
        )}

        {/* Standards */}
        {(source === "database" ? standards : personalDerived.standards).length > 0 && (
          <ProfileSection
            title="Standards & Certifications"
            count={(source === "database" ? standards : personalDerived.standards).length}
            headerExtra={isPersonal ? <EnrichmentToolbar sectionKey="standards" /> : undefined}
          >
            <div className="space-y-2">
              {(source === "database" ? standards : personalDerived.standards).map(
                (s: any, i: number) => (
                  <div
                    key={i}
                    className="bg-surface border border-border/60 rounded-md p-3 text-sm"
                  >
                    <div className="font-medium text-foreground">
                      {s.standard_name ?? s.name ?? s.standardName}
                      {s.standard_number && (
                        <span className="text-foreground-muted ml-2 text-xs">
                          {s.standard_number}
                        </span>
                      )}
                    </div>
                    {(s.scope || s.certifying_body) && (
                      <div className="text-xs text-foreground-secondary mt-1">
                        {s.scope}
                        {s.scope && s.certifying_body && " · "}
                        {s.certifying_body}
                      </div>
                    )}
                    {s.evidence && (
                      <p className="text-xs text-foreground-muted mt-2 leading-relaxed">
                        {s.evidence}
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>
          </ProfileSection>
        )}

        {/* Customers */}
        {(source === "database" ? customers : personalDerived.customers).length > 0 && (
          <ProfileSection
            title="Customer History"
            count={(source === "database" ? customers : personalDerived.customers).length}
            headerExtra={isPersonal ? <EnrichmentToolbar sectionKey="customers" /> : undefined}
          >
            <div className="space-y-2">
              {(source === "database" ? customers : personalDerived.customers).map(
                (c: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-4 bg-surface border border-border/60 rounded-md p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {c.customer_name ?? c.customerName ?? c.name}
                      </div>
                      {(c.description || c.domain) && (
                        <div className="text-xs text-foreground-secondary mt-1">
                          {c.description ?? c.domain}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(c.customer_segment ?? c.segment) && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {(c.customer_segment ?? c.segment).replace(/_/g, " ")}
                        </Badge>
                      )}
                      {c.year && (
                        <span className="text-xs text-foreground-muted">{c.year}</span>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          </ProfileSection>
        )}

        {/* Contacts (DB only) */}
        {source === "database" && contacts.length > 0 && (
          <ProfileSection title="Contacts" count={contacts.length}>
            <div className="space-y-2">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="bg-surface border border-border/60 rounded-md p-3 text-sm"
                >
                  <div className="font-medium text-foreground">{c.name}</div>
                  {c.title && (
                    <div className="text-xs text-foreground-secondary">{c.title}</div>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-foreground-secondary">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="hover:text-foreground transition-colors"
                      >
                        {c.email}
                      </a>
                    )}
                    {c.phone && <span>{c.phone}</span>}
                    {c.linkedin && (
                      <a
                        href={c.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-teal hover:underline"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ProfileSection>
        )}

        {/* Notes (personal actors only) */}
        {source === "personal" && personal && (
          <ProfileSection title="Notes">
            {editingNotes ? (
              <div className="space-y-3">
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add notes about this actor…"
                  className="min-h-[120px]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const ok = await updateNotes(personal.id, notesDraft);
                      if (ok) {
                        setPersonal({ ...personal, notes: notesDraft });
                        setEditingNotes(false);
                      }
                    }}
                    disabled={busy === "notes"}
                  >
                    <Check className="w-3.5 h-3.5" /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingNotes(false)}
                  >
                    <XIcon className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                {personal.notes && personal.notes.trim().length > 0 ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed flex-1">
                    {personal.notes}
                  </p>
                ) : (
                  <button
                    onClick={() => {
                      setNotesDraft("");
                      setEditingNotes(true);
                    }}
                    className="text-sm text-foreground-muted hover:text-foreground transition-colors"
                  >
                    Add notes
                  </button>
                )}
                {personal.notes && personal.notes.trim().length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      setNotesDraft(personal.notes ?? "");
                      setEditingNotes(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            )}
          </ProfileSection>
        )}

        {/* Source & Provenance */}
        <ProfileSection
          title="Source & Provenance"
          headerExtra={isPersonal ? <EnrichmentToolbar sectionKey="sources" /> : undefined}
        >
          <div className="space-y-3 text-sm">
            {source === "personal" && personal && (
              <>
                {sessionName && (
                  <IdentityRow label="Found in session" value={sessionName} />
                )}
                {personal.source_step && (
                  <IdentityRow
                    label="Source step"
                    value={
                      personal.source_step === "analysis"
                        ? "Deep Analysis"
                        : personal.source_step === "search"
                          ? "Search"
                          : personal.source_step
                    }
                  />
                )}
                {typeof personal.profile_completeness === "number" && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-1">
                      Profile completeness
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={personal.profile_completeness}
                        className="h-1.5 flex-1 max-w-xs"
                      />
                      <span className="text-xs text-foreground-secondary">
                        {personal.profile_completeness}%
                      </span>
                    </div>
                  </div>
                )}
                {personal.matched_main_db_actor_id && (
                  <IdentityRow
                    label="Matched to main database"
                    value={`Matched ${formatDate(personal.match_timestamp)}`}
                  />
                )}
                {personal.source_urls && personal.source_urls.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-foreground-muted mb-2">
                      Source URLs
                    </div>
                    <div className="flex flex-col gap-1">
                      {personal.source_urls.map((u, i) => (
                        <a
                          key={i}
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent-teal hover:underline truncate inline-flex items-center gap-1"
                        >
                          {u}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <IdentityRow label="Created" value={formatDate(personal.created_at)} />
              </>
            )}
            {source === "database" && dbActor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <IdentityRow label="Source" value={dbActor.source} />
                <IdentityRow
                  label="Verification"
                  value={dbActor.verification_status}
                />
                <IdentityRow label="Created" value={formatDate(dbActor.created_at)} />
                <IdentityRow
                  label="Last updated"
                  value={formatDate(dbActor.updated_at)}
                />
                {dbActor.data_completeness && dbActor.data_completeness.length > 0 && (
                  <IdentityRow
                    label="Data completeness"
                    value={dbActor.data_completeness.join(", ")}
                  />
                )}
              </div>
            )}
          </div>
        </ProfileSection>

        {/* Actions */}
        <ProfileSection title="Actions">
          <div className="flex flex-wrap gap-2">
            {source === "personal" && personal && (
              <>
                {personal.status === "suggested" ? (
                  <DisabledAction
                    label="Suggest for main database"
                    tip="Already suggested — awaiting admin review"
                  />
                ) : personal.status === "merged" ? (
                  <DisabledAction
                    label="Suggest for main database"
                    tip="Already in main database"
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSuggestOpen(true)}
                    disabled={busy === "suggest"}
                  >
                    Suggest for main database
                  </Button>
                )}
                {personal.status === "merged" ? (
                  <DisabledAction
                    label="Delete"
                    tip="Cannot delete — this actor is in the main database"
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteOpen(true)}
                    disabled={busy === "delete"}
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  >
                    Delete
                  </Button>
                )}
              </>
            )}
            {source === "database" && isAdmin && (
              <>
                <DisabledAction label="Edit profile" />
                <DisabledAction label="Promote to DB" />
                <DisabledAction label="Merge" />
                <DisabledAction label="Enrich" />
              </>
            )}
            {source === "database" && !isAdmin && (
              <span className="text-xs text-foreground-muted">
                Read-only — main database actors are managed by administrators.
              </span>
            )}
          </div>
        </ProfileSection>
      </div>

      {/* Confirmation dialogs (personal actors) */}
      {source === "personal" && personal && (
        <>
          <ConfirmActorActionDialog
            open={suggestOpen}
            onOpenChange={setSuggestOpen}
            title={`Suggest ${personal.actor_name} for the main database?`}
            description="This is a one-way action. An administrator will review the suggestion and may approve or reject it. You won't be able to retract the suggestion, but it can be rejected."
            confirmLabel="Suggest"
            onConfirm={async () => {
              const ok = await suggestForDb(personal.id);
              setSuggestOpen(false);
              if (ok) {
                setPersonal({
                  ...personal,
                  status: "suggested",
                  suggested_at: new Date().toISOString(),
                });
              }
            }}
          />
          <ConfirmActorActionDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete ${personal.actor_name} from your collection?`}
            description="This can't be undone. The actor stays in any search sessions where it was originally found."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              const ok = await deleteFromCollection(personal.id);
              setDeleteOpen(false);
              if (ok) navigate("/actors");
            }}
          />
        </>
      )}
    </div>
  );
};

export default ActorProfile;
