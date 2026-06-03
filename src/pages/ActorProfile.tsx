import React, { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import VerifiedStatusBadge from "@/components/nexus/VerifiedStatusBadge";
import { VerificationReviewDialog, type VerificationSubmitPayload } from "@/components/consultant/VerificationReviewDialog";
import {
  emptyCompletionSeed,
  type CompletionDecision,
  type CompletionSeed,
  type SeedPill,
} from "@/components/consultant/CompleteAndVerifyBody";
import { RecordOutcomeDialog } from "@/components/outcome/RecordOutcomeDialog";
import { OutcomeHistoryList } from "@/components/outcome/OutcomeHistoryList";
import { useActorOutcomes } from "@/hooks/useActorOutcomes";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import { OUTCOME_LABEL, OUTCOME_TYPES } from "@/types/outcome";
import { EnrichmentToolbar } from "@/components/nexus/EnrichmentToolbar";
import { UrlEnrichmentPanel } from "@/components/nexus/UrlEnrichmentPanel";
import { RegistryEnrichmentPanel } from "@/components/nexus/RegistryEnrichmentPanel";
import { DocumentEnrichmentPanel } from "@/components/nexus/DocumentEnrichmentPanel";
import { WebSearchEnrichmentPanel } from "@/components/nexus/WebSearchEnrichmentPanel";
import RelatedEntitiesSection from "@/components/actor-profile/RelatedEntitiesSection";
import AliasesSection from "@/components/actor-profile/AliasesSection";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { OntologyEntryList } from "@/components/nexus/OntologyEntryList";
import { appendManualOntologyItems } from "@/lib/actorEnrichment";
import { FromYourCollectionPanel } from "@/components/actor-profile/FromYourCollectionPanel";
import { ProductCardGrid } from "@/components/actor-profile/ProductCardGrid";
import { RefreshCw } from "lucide-react";
import {
  readOntologyEntries,
  type DisplayEntry,
} from "@/lib/readOntologyEntries";
import type { EnrichmentAcceptedItem } from "@/types/enrichment";
import type { SectionKey } from "@/config/enrichmentMethods";
import type { PersonalActor } from "@/types/personal-actor";
import type { DbActor } from "@/types/db-actor";
import { toast } from "sonner";
import { ActorMiniMap } from "@/components/map/ActorMiniMap";
import { ProfileEditToolbar } from "@/components/actor-profile/ProfileEditToolbar";
import { ActorLogo, ActorHeroBanner } from "@/components/actor-profile/ActorMedia";
import { MediaSlotEditor, type MediaSlotType, type ActorMediaRecord } from "@/components/actor-media/MediaSlotEditor";
import { ImagePlus, Trash2 as MediaTrash2, Loader2, Sparkles } from "lucide-react";
import { CapacityPanel } from "@/components/actor-profile/CapacityPanel";
import { EditableText } from "@/components/ui/editable/EditableText";
import { MergeActorsDialog } from "@/components/actor-profile/MergeActorsDialog";
import { RegistryRefreshDialog } from "@/components/actor-profile/RegistryRefreshDialog";
import { MacroCard, type PresenceState, type TrustBand } from "@/components/actor-profile/MacroCard";
import { ProvenanceBadge, computeProvenanceState } from "@/components/actor-profile/ProvenanceBadge";
import { cn } from "@/lib/utils";

type Source = "personal" | "database";

interface OntologyTagRow {
  id: string;
  ontology_entry_id: string;
  source: string;
  ontology_entries: {
    id: string;
    raw_name: string;
    status: string | null;
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
          id="edit-street-address"
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

function DbEditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-foreground-muted">{label}</span>
      {children}
    </div>
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
  const [reverifyOpen, setReverifyOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteArchivedOpen, setDeleteArchivedOpen] = useState(false);
  const [deleteArchivedReason, setDeleteArchivedReason] = useState("");
  const [deleteArchivedBusy, setDeleteArchivedBusy] = useState(false);
  const [reverifyBusy, setReverifyBusy] = useState(false);
  const [enrichMode, setEnrichMode] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const { programmes: managedProgrammes } = useManagedProgrammes();
  const canRecordOutcome = isAdmin || managedProgrammes.length > 0;

  // DB satellite data
  const [contacts, setContacts] = useState<any[]>([]);
  const [ontologyTags, setOntologyTags] = useState<OntologyTagRow[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [standards, setStandards] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [descriptions, setDescriptions] = useState<any[]>([]);
  const [media, setMedia] = useState<import("@/components/actor-profile/ActorMedia").ActorMediaRow[]>([]);
  const [capacityRows, setCapacityRows] = useState<import("@/components/actor-profile/CapacityPanel").CapacityAttributeRow[]>([]);

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

  // Profile-4: DB-side identity edit mode
  type DbIdentityDraft = {
    legal_name: string;
    org_number: string;
    street_address: string;
    city: string;
    region: string;
    country: string;
    postal_code: string;
  };
  const [editingDbIdentity, setEditingDbIdentity] = useState(false);
  const [dbDraft, setDbDraft] = useState<DbIdentityDraft | null>(null);
  const [savingDb, setSavingDb] = useState(false);
  // Part 2 / Prompt 2: registry refresh dialog for the DB-side edit toolbar.
  const [registryRefreshOpen, setRegistryRefreshOpen] = useState(false);
  // P3: media slot editor state
  // V3 batch #3 Area 2 — extended with linkedProductName + replaceMediaId
  // so per-product "Add image" / "Replace image" share the same editor.
  const [mediaEditor, setMediaEditor] = useState<{
    slot: MediaSlotType;
    linkedProductName?: string;
    replaceMediaId?: string;
    defaultQuery?: string;
  } | null>(null);
  const openMediaEditor = (slot: MediaSlotType) => setMediaEditor({ slot });
  const openProductImageEditor = (productName: string, replaceMediaId?: string) =>
    setMediaEditor({
      slot: "product",
      linkedProductName: productName,
      replaceMediaId,
      defaultQuery: `${name} ${productName}`.trim(),
    });
  // Continuation Area 3: media polling for freshly onboarded actors.
  const [mediaPolling, setMediaPolling] = useState(false);
  const [mediaPollTimedOut, setMediaPollTimedOut] = useState(false);
  const [retryingMediaScrape, setRetryingMediaScrape] = useState(false);
  const refreshMedia = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("actor_media")
      .select("id, type, url, original_url, crop_data")
      .eq("actor_id", id);
    if (data) setMedia(data as any);
  };
  // V3 batch #4 — refresh descriptions after per-product enrichment.
  const refreshDescriptions = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("actor_descriptions")
      .select("*")
      .eq("actor_id", id);
    if (data) setDescriptions(data as any);
  };
  const handleProductEnriched = async () => {
    await Promise.all([refreshMedia(), refreshDescriptions()]);
  };
  // V3 batch #4 — bulk "Enrich all products" runner.
  const [enrichAllRunning, setEnrichAllRunning] = useState(false);
  const [enrichAllProgress, setEnrichAllProgress] = useState({ done: 0, total: 0, failed: 0 });
  const handleMediaSaved = async () => {
    await refreshMedia();
  };
  const handleDeleteMedia = async (m: { id: string; url: string; original_url?: string | null }) => {
    if (!id) return;
    if (!window.confirm("Delete this image?")) return;
    try {
      const paths: string[] = [];
      const extract = (u: string | null | undefined) => {
        if (!u) return;
        const i = u.indexOf("/actor-media/");
        if (i >= 0) paths.push(u.substring(i + "/actor-media/".length));
      };
      extract(m.url);
      extract(m.original_url ?? null);
      if (paths.length) await supabase.storage.from("actor-media").remove(paths);
      const { error } = await supabase.from("actor_media").delete().eq("id", m.id);
      if (error) throw error;
      try {
        await (supabase as any).rpc("fn_audit_log_event", {
          p_event_type: "actor_media_deleted",
          p_target_table: "actor_media",
          p_target_record_id: m.id,
          p_actor_id: id,
          p_programme_id: null,
          p_changes: null,
          p_reason: null,
        });
      } catch { /* non-fatal */ }
      await refreshMedia();
      toast.success("Image deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete image.");
    }
  };

  // V3 batch #3 Area 2 — link/unlink an actor_media row to a product name by
  // patching crop_data.linked_product_name. Used by orphan-linking dropdown.
  const linkMediaToProduct = async (
    m: { id: string; crop_data?: any },
    productName: string | null,
  ) => {
    if (!id) return;
    try {
      const next = { ...(m.crop_data ?? {}), linked_product_name: productName };
      const { error } = await supabase
        .from("actor_media")
        .update({ crop_data: next })
        .eq("id", m.id);
      if (error) throw error;
      await refreshMedia();
      toast.success(productName ? `Linked to "${productName}"` : "Unlinked from product");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update link.");
    }
  };

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

  const actorIdForOutcomes = source === "database" ? dbActor?.id : personal?.matched_main_db_actor_id ?? undefined;
  const { outcomes: actorOutcomes, summary: outcomeSummary, refresh: refreshOutcomes } =
    useActorOutcomes(actorIdForOutcomes);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;

    function settledOk<T>(
      res: PromiseSettledResult<{ data: T | null; error: unknown }>,
      label: string,
    ): T | null {
      if (res.status === "rejected") {
        toast.error(`Failed to load ${label}: ${(res.reason as any)?.message ?? "Unknown error"}`);
        return null;
      }
      if (res.value.error) {
        toast.error(`Failed to load ${label}: ${(res.value.error as any).message ?? "Unknown error"}`);
        return null;
      }
      return res.value.data;
    }

    (async () => {
      setLoading(true);
      setSource(null);
      setPersonal(null);
      setDbActor(null);

      try {
        // Check admin role
        const { data: userRow } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) setIsAdmin(userRow?.role === "admin");

        // Try personal first
        const { data: pa, error: paErr } = await supabase
          .from("user_personal_actors")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (paErr) {
          toast.error(`Failed to load actor: ${paErr.message}`);
        }

        if (pa) {
          // Smart Merge: if this personal actor is matched to a verified DB
          // record, the DB profile becomes the canonical view. Redirect
          // (replace) so back-button doesn't loop. Personal row stays put.
          if (pa.matched_main_db_actor_id) {
            navigate(
              `/actors/${pa.matched_main_db_actor_id}?from-collection=${pa.id}${window.location.hash || ""}`,
              { replace: true },
            );
            return;
          }

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
          return;
        }

        // Try DB actor
        const { data: da, error: daErr } = await supabase
          .from("actors")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (cancelled) return;

        if (daErr) {
          toast.error(`Failed to load actor: ${daErr.message}`);
          return;
        }

        if (da) {
          setDbActor(da as unknown as DbActor);
          setSource("database");

          const results = await Promise.allSettled([
            supabase.from("actor_contacts").select("*").eq("actor_id", id),
            supabase
              .from("actor_ontology_tags")
              .select(
                "id, ontology_entry_id, source, source_url, evidence, confidence, accepted_at, ontology_entries(id, raw_name, status, category_id, ontology_categories(type, normalized_name))",
              )
              .eq("actor_id", id),
            supabase.from("actor_certifications").select("*").eq("actor_id", id),
            supabase.from("actor_standards").select("*").eq("actor_id", id),
            supabase.from("actor_customer_history").select("*").eq("actor_id", id),
            supabase.from("actor_descriptions").select("*").eq("actor_id", id),
            supabase.from("actor_media").select("id, type, url, original_url, crop_data").eq("actor_id", id),
            supabase.from("actor_capacity_attributes").select("id, attribute_type, value_text, value_min, value_max, unit, evidence").eq("actor_id", id),
          ]);

          if (cancelled) return;
          setContacts(settledOk<any[]>(results[0] as any, "contacts") ?? []);
          setOntologyTags((settledOk<any[]>(results[1] as any, "ontology tags") ?? []) as unknown as OntologyTagRow[]);
          setClassifications(settledOk<any[]>(results[2] as any, "certifications") ?? []);
          setStandards(settledOk<any[]>(results[3] as any, "standards") ?? []);
          setCustomers(settledOk<any[]>(results[4] as any, "customer history") ?? []);
          setDescriptions(settledOk<any[]>(results[5] as any, "descriptions") ?? []);
          setMedia((settledOk<any[]>(results[6] as any, "media") ?? []) as any);
          setCapacityRows((settledOk<any[]>(results[7] as any, "capacity") ?? []) as any);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  // Continuation Area 3: poll actor_media for ~60s when an actor was created
  // in the last 5 minutes and has no media yet. Auto-scrape runs server-side
  // on actor creation; this surfaces the result without a page reload.
  useEffect(() => {
    if (!id || source !== "database" || !dbActor) return;
    const created = dbActor.created_at ? new Date(dbActor.created_at).getTime() : 0;
    const ageMs = Date.now() - created;
    const isFresh = created > 0 && ageMs < 5 * 60 * 1000;
    const hasLogoOrHero = media.some((m) => m.type === "logo" || m.type === "hero");
    if (!isFresh || hasLogoOrHero) return;
    let cancelled = false;
    setMediaPolling(true);
    setMediaPollTimedOut(false);
    const started = Date.now();
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from("actor_media")
        .select("id, type, url, original_url, crop_data")
        .eq("actor_id", id);
      if (cancelled) return;
      if (data) setMedia(data as any);
      const found = (data ?? []).some((m: any) => m.type === "logo" || m.type === "hero");
      if (found) {
        window.clearInterval(interval);
        setMediaPolling(false);
        setMediaPollTimedOut(false);
        return;
      }
      if (Date.now() - started > 60_000) {
        window.clearInterval(interval);
        setMediaPolling(false);
        setMediaPollTimedOut(true);
      }
    }, 5_000);
    void refreshMedia();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      setMediaPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source, dbActor?.id]);

  const handleRetryMediaScrape = async () => {
    if (!id) return;
    setRetryingMediaScrape(true);
    setMediaPollTimedOut(false);
    try {
      const { error } = await supabase.functions.invoke("scrape-actor-media", {
        body: { actor_id: id },
      });
      if (error) throw error;
      toast.success("Re-scanning website for logo and hero image…");
      // Kick off a fresh poll
      setMediaPolling(true);
      const started = Date.now();
      const interval = window.setInterval(async () => {
        const { data } = await supabase
          .from("actor_media")
          .select("id, type, url, original_url, crop_data")
          .eq("actor_id", id);
        if (data) setMedia(data as any);
        const found = (data ?? []).some((m: any) => m.type === "logo" || m.type === "hero");
        if (found) {
          window.clearInterval(interval);
          setMediaPolling(false);
          return;
        }
        if (Date.now() - started > 60_000) {
          window.clearInterval(interval);
          setMediaPolling(false);
          setMediaPollTimedOut(true);
        }
      }, 5_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retry media scrape");
    } finally {
      setRetryingMediaScrape(false);
    }
  };


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

  // DB-side DisplayEntry maps built from actor_ontology_tags rows. Used to
  // render chip-expand metadata (OntologyEntryList) on DB profiles, matching
  // the personal-side behaviour.
  const dbOntologyEntries = useMemo(() => {
    const empty = {
      capabilities: [] as DisplayEntry[],
      competences: [] as DisplayEntry[],
      domains: [] as DisplayEntry[],
      products: [] as DisplayEntry[],
      services: [] as DisplayEntry[],
    };
    if (source !== "database") return empty;
    const typeToKey: Record<string, keyof typeof empty> = {
      capability: "capabilities",
      competence: "competences",
      domain: "domains",
      product_type: "products",
      service_type: "services",
    };
    const sourceMap: Record<string, EnrichmentAcceptedItem["source"]> = {
      manual: "manual",
      search: "pipeline_search",
      api_connector: "registry",
    };
    for (const tag of ontologyTags) {
      const entry = tag.ontology_entries;
      const t = entry?.ontology_categories?.type;
      const key = t ? typeToKey[t] : undefined;
      if (!key || !entry?.raw_name) continue;
      const raw = tag as unknown as {
        source?: string;
        source_url?: string | null;
        evidence?: string | null;
        confidence?: "high" | "medium" | "low" | null;
        accepted_at?: string | null;
      };
      empty[key].push({
        name: entry.raw_name,
        meta: {
          entry_name: entry.raw_name,
          source: sourceMap[raw.source ?? ""] ?? "pipeline_search",
          source_url: raw.source_url ?? undefined,
          evidence: raw.evidence ?? undefined,
          confidence: raw.confidence ?? undefined,
          accepted_at: raw.accepted_at ?? undefined,
        },
      });
    }
    return empty;
  }, [source, ontologyTags]);

  // B4: build CompletionSeed from existing actor_ontology_tags for re-verify path
  const reverifySeed = useMemo<CompletionSeed>(() => {
    if (source !== "database") return emptyCompletionSeed();
    const seed = emptyCompletionSeed();
    const typeToKey: Record<string, keyof CompletionSeed> = {
      capability: "capabilities",
      competence: "competences",
      domain: "domains",
      product_type: "products",
      service_type: "services",
    };
    for (const tag of ontologyTags) {
      const entry = tag.ontology_entries;
      const type = entry?.ontology_categories?.type;
      const key = type ? typeToKey[type] : undefined;
      if (!key || !entry?.raw_name) continue;
      const pill: SeedPill = {
        entry_name: entry.raw_name,
        ontology_entry_id: entry.id,
        status: entry.status ?? "active",
      };
      seed[key].push(pill);
    }
    return seed;
  }, [source, ontologyTags]);

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

  // Profile-4: DB-side identity edit ------------------------------------------
  const openDbEdit = () => {
    if (!dbActor) return;
    setDbDraft({
      legal_name: dbActor.legal_name ?? "",
      org_number: dbActor.org_number ?? "",
      street_address: dbActor.street_address ?? "",
      city: dbActor.city ?? "",
      region: dbActor.region ?? "",
      country: dbActor.country ?? "",
      postal_code: (dbActor as unknown as { postal_code?: string | null }).postal_code ?? "",
    });
    setEditingDbIdentity(true);
  };

  const cancelDbEdit = () => {
    setEditingDbIdentity(false);
    setDbDraft(null);
  };

  const saveDbEdit = async () => {
    if (!dbActor || !dbDraft) return;
    setSavingDb(true);
    try {
      const fields: (keyof DbIdentityDraft)[] = [
        "legal_name", "org_number", "street_address", "city", "region", "country", "postal_code",
      ];
      const updates: Record<string, string | null> = {};
      for (const f of fields) {
        const next = (dbDraft[f] ?? "").trim();
        const current = ((dbActor as unknown as Record<string, unknown>)[f] as string | null | undefined) ?? "";
        if (next !== current) updates[f] = next === "" ? null : next;
      }
      if (!updates.legal_name && (dbDraft.legal_name ?? "").trim() === "") {
        toast.error("Legal name cannot be empty");
        setSavingDb(false);
        return;
      }
      if (Object.keys(updates).length === 0) {
        setEditingDbIdentity(false);
        setDbDraft(null);
        setSavingDb(false);
        return;
      }
      const { error } = await supabase.rpc("fn_update_actor", {
        p_actor_id: dbActor.id,
        p_updates: updates as never,
        p_reason: null,
      });
      if (error) throw error;
      const { data: refreshed } = await supabase
        .from("actors").select("*").eq("id", dbActor.id).maybeSingle();
      if (refreshed) setDbActor(refreshed as DbActor);
      toast.success("Profile updated");
      setEditingDbIdentity(false);
      setDbDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingDb(false);
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

  // ---------- V3 Batch A — presence + trust per macro-card ----------
  const anyStale = useMemo(() => {
    const rows: Array<{ verified_at?: string | null; decays_at?: string | null }> = [
      ...(dbActor ? [{ verified_at: dbActor.verified_at, decays_at: dbActor.decays_at }] : []),
      ...classifications,
      ...standards,
      ...customers,
      ...capacityRows,
      ...contacts,
    ];
    const now = Date.now();
    return rows.some((r) =>
      r?.verified_at && r?.decays_at && new Date(r.decays_at).getTime() < now,
    );
  }, [dbActor, classifications, standards, customers, capacityRows, contacts]);

  const dbVerified = source === "database" && Boolean(dbActor?.verified_at);
  const trustForDb = (rowsAny: any[]): TrustBand => {
    if (rowsAny.some((r: any) => r?.verified_at && r?.decays_at && new Date(r.decays_at).getTime() < Date.now())) return "stale";
    if (rowsAny.some((r: any) => r?.verified_at)) return "verified";
    if (source === "personal") return "user";
    return "auto";
  };

  // Card 1 — Identity & Registry
  const presenceIdentity: PresenceState = anyStale && dbVerified
    ? "stale"
    : !name
      ? "missing"
      : name && (orgNumber || website) && addressComposed
        ? "complete"
        : "partial";
  const trustIdentity: TrustBand = dbVerified ? (anyStale ? "stale" : "verified") : (source === "personal" ? "user" : "auto");

  // Card 2 — What They Do
  const wtdCounts = (["capabilities", "competences", "domains", "products", "services"] as const)
    .map((k) => ontology[k]?.length ?? 0);
  const presenceWhatTheyDo: PresenceState = wtdCounts.every((n) => n > 0)
    ? "complete"
    : wtdCounts.some((n) => n > 0)
      ? "partial"
      : "missing";
  const trustWhatTheyDo: TrustBand = trustForDb([
    ...(personalOntologyEntries?.capabilities ?? []),
    ...(dbOntologyEntries?.capabilities ?? []),
  ]);

  // Card 3 — Credentials
  const credCounts = { cap: capacityRows.length, cls: classifications.length, std: standards.length, cust: customers.length };
  const presenceCredentials: PresenceState = credCounts.cap > 0 && (credCounts.cls + credCounts.std > 0)
    ? "complete"
    : credCounts.cap > 0 || credCounts.cls + credCounts.std > 0
      ? "partial"
      : "missing";
  const trustCredentials: TrustBand = trustForDb([...classifications, ...standards, ...customers, ...capacityRows]);

  // Card 4 — People & Relationships
  const presencePeople: PresenceState = contacts.length > 0 ? "complete" : "missing";
  const trustPeople: TrustBand = trustForDb(contacts);

  // Card 5 — Provenance & Outcomes
  const presenceProvenance: PresenceState = dbActor?.source && actorOutcomes.length > 0
    ? "complete"
    : dbActor?.source || personal?.source_step
      ? "partial"
      : "missing";
  const trustProvenance: TrustBand = "neutral";

  // Card 6 — My Collection
  const hasPersonalContent = Boolean(
    (personal?.notes && personal.notes.trim()) ||
      (personal?.tags && personal.tags.length > 0),
  );
  const presenceCollection: PresenceState = hasPersonalContent ? "complete" : "missing";
  const trustCollection: TrustBand = "user";

  // Linked personal actor (DB-side Card 6 CTA).
  const [linkedPersonalId, setLinkedPersonalId] = useState<string | null>(null);
  useEffect(() => {
    if (source !== "database" || !dbActor?.id || !user?.id) {
      setLinkedPersonalId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_personal_actors")
        .select("id")
        .eq("user_id", user.id)
        .eq("matched_main_db_actor_id", dbActor.id)
        .maybeSingle();
      if (!cancelled) setLinkedPersonalId(data?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [source, dbActor?.id, user?.id]);

  const handleAddToCollection = async () => {
    if (!user?.id || !dbActor) return;
    if (linkedPersonalId) {
      navigate(`/actors/${linkedPersonalId}`);
      return;
    }
    const { data: created, error } = await supabase
      .from("user_personal_actors")
      .insert({
        user_id: user.id,
        actor_name: dbActor.legal_name,
        country: dbActor.country,
        actor_website: dbActor.websites?.[0] ?? null,
        matched_main_db_actor_id: dbActor.id,
        match_timestamp: new Date().toISOString(),
        status: "personal",
      })
      .select("id")
      .single();
    if (error) {
      toast.error(`Could not add to collection: ${error.message}`);
      return;
    }
    toast.success("Added to your collection");
    navigate(`/actors/${created.id}`);
  };

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

        {/* Archived/merged banner */}
        {source === "database" && dbActor?.verification_status === "merged_into_other" && (
          <div className="mb-4 bg-warning/10 border border-warning/30 rounded-md p-4 flex items-start gap-3">
            <div className="text-sm flex-1">
              <div className="font-medium text-foreground mb-1">This actor has been merged</div>
              <div className="text-foreground-secondary">
                It was archived
                {(dbActor as any).merged_at
                  ? ` on ${new Date((dbActor as any).merged_at).toLocaleDateString()}`
                  : ""}
                {(dbActor as any).merged_into_id && (
                  <>
                    {" "}— see the{" "}
                    <Link
                      to={`/actors/${(dbActor as any).merged_into_id}`}
                      className="text-accent-teal hover:underline"
                    >
                      surviving record
                    </Link>
                    .
                  </>
                )}
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => setDeleteArchivedOpen(true)}
                className="text-xs px-3 py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 whitespace-nowrap"
              >
                Delete permanently
              </button>
            )}
          </div>
        )}


        {source === "database" && (() => {
          const hero = media.find((m) => m.type === "hero") as any;
          if (hero) {
            return (
              <div className="relative group">
                <ActorHeroBanner url={hero.url} alt={`${name} hero`} />
                {editingDbIdentity && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <Button size="sm" variant="secondary" onClick={() => openMediaEditor("hero")}>
                      <ImagePlus className="w-3.5 h-3.5 mr-1" /> Replace
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteMedia(hero)}>
                      <MediaTrash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          }
          if (mediaPolling) {
            return (
              <div className="w-full h-[240px] mb-4 rounded-lg border border-border bg-surface animate-pulse flex items-center justify-center">
                <span className="text-xs uppercase tracking-wider text-foreground-muted">
                  Fetching logo and hero image…
                </span>
              </div>
            );
          }
          if (mediaPollTimedOut) {
            return (
              <div className="w-full mb-4 rounded-lg border border-dashed border-border bg-surface px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-xs text-foreground-muted">
                  Couldn't auto-fetch logo or hero image from the website.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetryMediaScrape}
                  disabled={retryingMediaScrape}
                >
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", retryingMediaScrape && "animate-spin")} />
                  Retry media scrape
                </Button>
              </div>
            );
          }
          return editingDbIdentity ? (
            <button
              type="button"
              onClick={() => openMediaEditor("hero")}
              className="w-full h-[120px] mb-4 rounded-lg border border-dashed border-border hover:border-border-accent bg-surface text-foreground-muted hover:text-foreground flex items-center justify-center gap-2 transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              <span className="text-sm">Add hero image</span>
            </button>
          ) : null;
        })()}

        {/* Header card */}
        <div className="bg-surface border border-border rounded-lg p-6 mb-2">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-4 min-w-0">
              {source === "database" && (() => {
                const logo = media.find((m) => m.type === "logo") as any;
                if (!logo && mediaPolling) {
                  return (
                    <div
                      style={{ width: 72, height: 72 }}
                      className="rounded-md bg-elevated border border-border animate-pulse shrink-0"
                      aria-label="Fetching logo…"
                    />
                  );
                }
                const inner = <ActorLogo name={name} url={logo?.url ?? null} />;
                if (!editingDbIdentity) return inner;
                return (
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={() => openMediaEditor("logo")}
                      className="block rounded-md ring-2 ring-transparent hover:ring-accent-teal/60 transition"
                      title="Change logo"
                    >
                      {inner}
                    </button>
                    {logo && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMedia(logo)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                        title="Delete logo"
                      >
                        <MediaTrash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })()}
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                {name}
              </h1>
            </div>
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
            {dbActor && (
              <VerifiedStatusBadge
                size="md"
                showLabel
                verifiedAt={dbActor.verified_at}
                decaysAt={dbActor.decays_at}
              />
            )}
            {dbActor?.actor_classification === "reference" && (
              <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/30 uppercase tracking-wider">
                Reference
              </Badge>
            )}
            {dbActor?.actor_classification === "commercial" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                Commercial
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
          {dbActor?.verified_at && (
            <p className="text-xs text-foreground-muted mt-2">
              Verified
              {dbActor.verifier_id ? " by consultant" : ""}
              {" on "}
              {new Date(dbActor.verified_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              {dbActor.decays_at && (
                <>
                  {" · decays "}
                  {new Date(dbActor.decays_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </>
              )}
            </p>
          )}
          {/* Phase 6.5.5b/6.5.6: Re-verify + Record outcome action row */}
          {source === "database" && dbActor && (isAdmin || canRecordOutcome) && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setReverifyOpen(true)}>
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                  Re-verify
                </Button>
              )}
              {canRecordOutcome && (
                <Button size="sm" variant="outline" onClick={() => setOutcomeOpen(true)}>
                  Record outcome
                </Button>
              )}
            </div>
          )}
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

        {/* V3 Batch A — 5 macro-cards + My Collection */}
        <MacroCard
          title="Identity & Registry"
          cardKey="identity"
          viewerId={user?.id ?? null}
          actorId={id ?? null}
          presence={presenceIdentity}
          trust={trustIdentity}
        >
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
            ) : source === "database" && editingDbIdentity && dbDraft ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <DbEditRow label="Legal name">
                  <EditableText
                    editing
                    value={dbDraft.legal_name}
                    onChange={(v) => setDbDraft({ ...dbDraft, legal_name: v })}
                    placeholder="Required"
                  />
                </DbEditRow>
                {tradeNames.length > 0 && (
                  <IdentityRow label="Trade names" value={tradeNames.join(", ")} />
                )}
                <DbEditRow label="Org number">
                  <EditableText editing value={dbDraft.org_number}
                    onChange={(v) => setDbDraft({ ...dbDraft, org_number: v })} placeholder="—" />
                </DbEditRow>
                <DbEditRow label="Country">
                  <EditableText editing value={dbDraft.country}
                    onChange={(v) => setDbDraft({ ...dbDraft, country: v })} placeholder="ISO-2, e.g. NO" />
                </DbEditRow>
                <DbEditRow label="Street address">
                  <div id="edit-street-address">
                    <EditableText editing value={dbDraft.street_address}
                      onChange={(v) => setDbDraft({ ...dbDraft, street_address: v })} placeholder="—" />
                  </div>
                </DbEditRow>
                <DbEditRow label="Postal code">
                  <EditableText editing value={dbDraft.postal_code}
                    onChange={(v) => setDbDraft({ ...dbDraft, postal_code: v })} placeholder="—" />
                </DbEditRow>
                <DbEditRow label="City">
                  <EditableText editing value={dbDraft.city}
                    onChange={(v) => setDbDraft({ ...dbDraft, city: v })} placeholder="—" />
                </DbEditRow>
                <DbEditRow label="Region">
                  <EditableText editing value={dbDraft.region}
                    onChange={(v) => setDbDraft({ ...dbDraft, region: v })} placeholder="—" />
                </DbEditRow>
                {website && <IdentityRow label="Website" value={website} />}
              </div>
            ) : (
              <>
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
                <div className="mt-4">
                  <ActorMiniMap
                    latitude={
                      dbActor?.latitude ??
                      (personal as unknown as { latitude?: number | null } | null)?.latitude ??
                      null
                    }
                    longitude={
                      dbActor?.longitude ??
                      (personal as unknown as { longitude?: number | null } | null)?.longitude ??
                      null
                    }
                    precision={
                      (dbActor?.geocoded_precision ??
                        (personal as unknown as { geocoded_precision?: string | null } | null)
                          ?.geocoded_precision ??
                        null) as
                        | "street"
                        | "postal"
                        | "city"
                        | "country"
                        | "failed"
                        | null
                    }
                    retryHref="#"
                    onAddAddress={
                      // P1.4 fix: open edit mode + focus first address field.
                      // Personal-side: any owner. DB-side: admin only.
                      (source === "personal" && personal) ||
                      (source === "database" && dbActor && isAdmin)
                        ? () => {
                            if (source === "personal") {
                              openIdentityEdit();
                            } else {
                              openDbEdit();
                            }
                            setTimeout(() => {
                              const el = document.getElementById(
                                "edit-street-address",
                              ) as HTMLInputElement | null;
                              if (el) {
                                el.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                                el.focus();
                              }
                            }, 80);
                          }
                        : undefined
                    }
                  />
                </div>
              </>
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
        </MacroCard>

        <MacroCard
          title="What They Do"
          cardKey="what_they_do"
          viewerId={user?.id ?? null}
          actorId={id ?? null}
          presence={presenceWhatTheyDo}
          trust={trustWhatTheyDo}
        >
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
              {(() => {
                // P1.2 fix: render actor_descriptions of matching type as italic muted
                // paragraphs above the chip list. Applies to both personal-side and
                // DB-side profiles (personal-side has no rows today — renders nothing).
                const descTypeMap: Partial<Record<typeof key, string>> = {
                  capabilities: "capability",
                  products: "product",
                  services: "service",
                };
                const descType = descTypeMap[key];
                const matching = descType
                  ? descriptions.filter((d: any) => d?.type === descType)
                  : [];
                return matching.length > 0 ? (
                  <div className="mb-3 space-y-2">
                    {matching.map((d: any, i: number) => (
                      <p
                        key={d.id ?? i}
                        className="text-sm italic text-foreground-muted leading-relaxed"
                      >
                        {d.content}
                      </p>
                    ))}
                  </div>
                ) : null;
              })()}
              {source === "database" && key === "products" && editingDbIdentity && (() => {
                // V3 batch #3 Area 2 — Standalone "Add product image" button
                // is removed. Instead: per-card Add/Replace lives in
                // ProductCardGrid. This block now shows the management list
                // of all product images with link/unlink controls.
                const productMedia = media.filter((m) => m.type === "product");
                if (productMedia.length === 0) return null;
                const productNames = dbOntologyEntries.products.map((e) => e.name);
                return (
                  <div className="mb-3 space-y-1.5 border border-border/60 rounded-md p-2 bg-surface/40">
                    <div className="text-[10px] uppercase tracking-wider text-foreground-muted mb-1">
                      Product image management
                    </div>
                    {productMedia.map((pm: any) => {
                      const linked = pm.crop_data?.linked_product_name ?? null;
                      return (
                        <div key={pm.id} className="flex items-center gap-2 text-xs">
                          <img
                            src={pm.url}
                            alt=""
                            className="w-10 h-10 object-cover rounded border border-border shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-foreground-muted truncate">
                              {pm.url.split("/").pop()}
                            </div>
                            {linked ? (
                              <div className="text-accent-teal truncate">
                                Linked to: {linked}
                              </div>
                            ) : (
                              <div className="text-warning">Unlinked</div>
                            )}
                          </div>
                          <select
                            className="bg-elevated border border-border rounded px-2 py-1 text-xs"
                            value={linked ?? ""}
                            onChange={(e) =>
                              linkMediaToProduct(pm, e.target.value || null)
                            }
                          >
                            <option value="">— Unlinked —</option>
                            {productNames.map((pn) => (
                              <option key={pn} value={pn}>{pn}</option>
                            ))}
                          </select>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteMedia(pm)} title="Delete image">
                            <MediaTrash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {items.length > 0 ? (
                isPersonal ? (
                  <OntologyEntryList entries={personalOntologyEntries[key]} />
                ) : source === "database" && key === "products" ? (
                  <>
                    {editingDbIdentity && dbOntologyEntries.products.length > 0 && (
                      <div className="mb-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={enrichAllRunning}
                          onClick={async () => {
                            if (!dbActor?.id) return;
                            const list = dbOntologyEntries.products.map((e) => e.name);
                            if (list.length === 0) return;
                            if (
                              !window.confirm(
                                `Auto-enrich all ${list.length} products for ${name}? This scrapes the actor's website and calls the LLM once per product.`,
                              )
                            )
                              return;
                            setEnrichAllRunning(true);
                            setEnrichAllProgress({ done: 0, total: list.length, failed: 0 });
                            let done = 0;
                            let failed = 0;
                            for (const productName of list) {
                              try {
                                const { data, error } = await supabase.functions.invoke(
                                  "enrich-product-page",
                                  { body: { actor_id: dbActor.id, product_name: productName } },
                                );
                                if (error || !data?.found) failed += 1;
                              } catch {
                                failed += 1;
                              }
                              done += 1;
                              setEnrichAllProgress({ done, total: list.length, failed });
                            }
                            await handleProductEnriched();
                            setEnrichAllRunning(false);
                            toast.success(
                              `Enrich-all complete: ${done - failed} succeeded, ${failed} failed of ${list.length}`,
                            );
                          }}
                        >
                          {enrichAllRunning ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Enriching {enrichAllProgress.done}/{enrichAllProgress.total}
                              {enrichAllProgress.failed > 0 && ` (${enrichAllProgress.failed} failed)`}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 mr-1" />
                              Enrich all products
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    <ProductCardGrid
                      products={dbOntologyEntries.products.map((e) => ({
                        entry_name: e.name,
                        evidence: e.meta?.evidence ?? null,
                        confidence: e.meta?.confidence ?? null,
                        source_url: e.meta?.source_url ?? null,
                      }))}
                      descriptions={descriptions
                        .filter((d: any) => d?.type === "product")
                        .map((d: any) => ({
                          type: d.type,
                          content: d.content,
                          name: d.name ?? null,
                          source_url: d.source_url ?? null,
                          metadata: d.metadata ?? null,
                        }))}
                      media={media
                        .filter((m: any) => m.type === "product" || m.type === "datasheet")
                        .map((m: any) => ({
                          id: m.id,
                          type: m.type,
                          url: m.url,
                          crop_data: m.crop_data ?? null,
                        }))}
                      actorId={dbActor?.id}
                      actorName={name}
                      editable={editingDbIdentity}
                      onEnriched={handleProductEnriched}
                      onAddImage={(productName) => openProductImageEditor(productName)}
                      onReplaceImage={async (productName, mediaId) => {
                        // Replace = delete existing, then open editor for new.
                        const existing = media.find((m: any) => m.id === mediaId);
                        if (existing) {
                          await handleDeleteMedia(existing as any).catch(() => {});
                        }
                        openProductImageEditor(productName);
                      }}
                    />
                  </>
                ) : source === "database" ? (
                  <OntologyEntryList entries={dbOntologyEntries[key]} />
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
        </MacroCard>

        <MacroCard
          title="Credentials"
          cardKey="credentials"
          viewerId={user?.id ?? null}
          actorId={id ?? null}
          presence={presenceCredentials}
          trust={trustCredentials}
        >
        {/* Capacity (DB only, when present) */}
        {source === "database" && capacityRows.length > 0 && (
          <ProfileSection title="Capacity" count={capacityRows.length}>
            <CapacityPanel rows={capacityRows} />
          </ProfileSection>
        )}

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
        </MacroCard>

        <MacroCard
          title="People & Relationships"
          cardKey="people"
          viewerId={user?.id ?? null}
          actorId={id ?? null}
          presence={presencePeople}
          trust={trustPeople}
        >
        {/* Contacts (DB only) */}
        {source === "database" && dbActor && (
          <ProfileSection
            title="Contacts"
            count={contacts.length}
            headerExtra={
              dbActor.websites?.[0] ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const baseUrl = dbActor.websites?.[0];
                    if (!baseUrl) return;
                    toast.info("Scanning team page…");
                    try {
                      const { data, error } = await supabase.functions.invoke(
                        "enrich-from-team-page",
                        { body: { actor_id: dbActor.id, base_url: baseUrl } },
                      );
                      if (error) throw new Error(error.message);
                      const written = (data as { written_count?: number })?.written_count ?? 0;
                      const src = (data as { source_url?: string | null })?.source_url;
                      if (written > 0) {
                        toast.success(`Added ${written} contact${written === 1 ? "" : "s"} from ${src ?? "team page"}.`);
                        const { data: refreshed } = await supabase
                          .from("actor_contacts")
                          .select("*")
                          .eq("actor_id", dbActor.id);
                        setContacts(refreshed ?? []);
                      } else if (src) {
                        toast.message(`Scanned ${src} — no new contacts found.`);
                      } else {
                        toast.message("No team/about page found on this website.");
                      }
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Scan failed");
                    }
                  }}
                >
                  Scan team page
                </Button>
              ) : null
            }
          >
            {contacts.length === 0 ? (
              <div className="text-xs text-foreground-secondary">
                No contacts yet. Use "Scan team page" to auto-extract from the website, or add manually.
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    className="bg-surface border border-border/60 rounded-md p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground">{c.name}</div>
                      {c.source === "auto_scrape" && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                          Auto-extracted
                        </span>
                      )}
                    </div>
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
            )}
          </ProfileSection>
        )}

        {/* P10: Aliases & former names */}
        {source === "database" && dbActor && (
          <ProfileSection title="Aliases & former names">
            <AliasesSection actorId={dbActor.id} canEdit={isAdmin} />
          </ProfileSection>
        )}

        {/* P10/P1: Related entities (corporate groups, acquisitions, renames) */}
        {source === "database" && dbActor && (
          <ProfileSection title="Related entities">
            <RelatedEntitiesSection actorId={dbActor.id} canEdit={isAdmin} />
          </ProfileSection>
        )}
        </MacroCard>

        <MacroCard
          title="Provenance & Outcomes"
          cardKey="provenance"
          viewerId={user?.id ?? null}
          actorId={id ?? null}
          presence={presenceProvenance}
          trust={trustProvenance}
        >
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

        {/* Phase 6.5.6: Outcome history (database actors only — outcomes link to verified records) */}
        {source === "database" && dbActor && (
          <ProfileSection title="Outcome history" count={actorOutcomes.length}>
            <OutcomeHistoryList
              outcomes={actorOutcomes}
              variant="actor"
              emptyState={
                canRecordOutcome
                  ? "No outcomes recorded yet. Use 'Record outcome' above to capture the first one."
                  : "No outcomes recorded yet."
              }
            />
          </ProfileSection>
        )}

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
            {source === "database" && dbActor && (
              <ProfileEditToolbar
                editing={editingDbIdentity}
                isAdmin={isAdmin}
                saving={savingDb}
                hasChanges={!!dbDraft}
                onEdit={openDbEdit}
                onSave={saveDbEdit}
                onCancel={cancelDbEdit}
                onReverify={isAdmin ? () => { setEnrichMode(false); setReverifyOpen(true); } : undefined}
                onEnrich={isAdmin ? () => { setEnrichMode(true); setReverifyOpen(true); } : undefined}
                onMerge={isAdmin ? () => setMergeOpen(true) : undefined}
                onRegistryRefresh={isAdmin && dbDraft ? () => setRegistryRefreshOpen(true) : undefined}
              />
            )}
          </div>
        </ProfileSection>
        </MacroCard>

        <MacroCard
          title={`My Collection on ${name}`}
          cardKey="my_collection"
          viewerId={user?.id ?? null}
          actorId={id ?? null}
          presence={presenceCollection}
          trust={trustCollection} variant="collection"
        >
          {source === "database" && dbActor && user && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-foreground-secondary flex-1 min-w-[200px]">
                Your personal collection on this actor. Add notes, evidence, and personal tags in your collection view.
              </p>
              <Button size="sm" variant="outline" onClick={handleAddToCollection}>
                {linkedPersonalId ? "Edit in my collection" : "Add to my collection"}
              </Button>
            </div>
          )}

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

        {/* Smart Merge: "From your collection" — surfaces user's personal
            notes, tags, and item-addition proposals against this DB actor. */}
        {source === "database" && dbActor && (
          <FromYourCollectionPanel dbActorId={dbActor.id} />
        )}
        </MacroCard>
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
      {dbActor && (
        <VerificationReviewDialog
          open={reverifyOpen}
          onOpenChange={(next) => {
            if (!next) setEnrichMode(false);
            setReverifyOpen(next);
          }}
          initialMode={enrichMode ? "complete" : "approve"}
          title={enrichMode ? `Enrich · ${dbActor.legal_name}` : `Re-verify ${dbActor.legal_name}`}
          description={enrichMode
            ? "Scrape the actor's website for new ontology proposals, review them via the four-action UX, and submit to update the actor's verified record."
            : "Record a new verification event with current evidence and a fresh decay window."}
          primaryLabel="Verify"
          busy={reverifyBusy}
          outcomesPanel={
            actorOutcomes.length > 0 ? (
              <div className="bg-elevated border border-border rounded-md p-3 text-sm space-y-1">
                <div className="text-xs uppercase tracking-wide text-foreground-muted">
                  Past outcomes for this actor
                </div>
                <ul className="space-y-0.5">
                  {OUTCOME_TYPES.map((t) =>
                    outcomeSummary[t] > 0 ? (
                      <li key={t} className="text-foreground-secondary">
                        • {outcomeSummary[t]} {OUTCOME_LABEL[t].toLowerCase()}
                      </li>
                    ) : null,
                  )}
                </ul>
                <div className="text-xs text-foreground-muted pt-1">
                  Scroll the profile for full outcome history.
                </div>
              </div>
            ) : null
          }
          summary={
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-4">
              <dt className="text-foreground-muted">Name</dt>
              <dd className="text-foreground">{dbActor.legal_name}</dd>
              {dbActor.country && (<><dt className="text-foreground-muted">Country</dt><dd className="text-foreground">{dbActor.country}</dd></>)}
              {dbActor.org_number && (<><dt className="text-foreground-muted">Org no.</dt><dd className="text-foreground font-mono">{dbActor.org_number}</dd></>)}
            </dl>
          }
          onApprove={async (p: VerificationSubmitPayload) => {
            setReverifyBusy(true);
            const { error } = await supabase.rpc("fn_verify_actor", {
              p_actor_id: dbActor.id,
              p_evidence: p.evidence as unknown as never,
              p_decays_at: p.decays_at,
              p_confidence: p.confidence,
              p_notes: p.notes || null,
              p_programme_id: null,
            });
            setReverifyBusy(false);
            if (error) { toast.error(error.message); return; }
            toast.success("Actor re-verified");
            setEnrichMode(false);
            setReverifyOpen(false);
            // Refresh denormalised columns
            const { data: refreshed, error: refreshErr } = await supabase.from("actors").select("*").eq("id", dbActor.id).maybeSingle();
            if (refreshErr) {
              toast.error(`Verification saved, but refresh failed: ${refreshErr.message}`);
            } else if (refreshed) {
              setDbActor(refreshed as DbActor);
            }
          }}
          completion={{
            mode: "re-verify",
            actionLabel: "Complete & re-verify",
            submitLabel: "Save completion and re-verify",
            websiteUrl: dbActor.websites?.[0] ?? null,
            actorContext: { actor_name: dbActor.legal_name, country: dbActor.country ?? null },
            seed: reverifySeed,
            enabled: isAdmin,
            draftTarget: { targetType: "actor", targetId: dbActor.id },
            disabledReason: isAdmin
              ? undefined
              : "Admin only — completion writes new ontology tags and proposed entries.",
            onSubmit: async (p, decisions: CompletionDecision[]) => {
              setReverifyBusy(true);
              const { error } = await supabase.rpc("fn_verify_actor", {
                p_actor_id: dbActor.id,
                p_evidence: p.evidence as unknown as never,
                p_decays_at: p.decays_at,
                p_confidence: p.confidence,
                p_notes: p.notes || null,
                p_programme_id: null,
                p_consultant_decisions: decisions as unknown as never,
              });
              setReverifyBusy(false);
              if (error) { toast.error(error.message); return; }
              if (decisions.length > 0) {
                toast.success("Actor enriched and re-verified");
              } else {
                toast.success("Actor re-verified");
              }
              setEnrichMode(false);
              setReverifyOpen(false);
              const { data: refreshed } = await supabase.from("actors").select("*").eq("id", dbActor.id).maybeSingle();
              if (refreshed) setDbActor(refreshed as DbActor);
            },
          }}
        />
      )}
      {dbActor && (
        <RecordOutcomeDialog
          open={outcomeOpen}
          onOpenChange={setOutcomeOpen}
          actorId={dbActor.id}
          actorName={dbActor.legal_name}
          onRecorded={refreshOutcomes}
        />
      )}

      {source === "database" && dbActor && (
        <MergeActorsDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          survivor={{
            id: dbActor.id,
            legal_name: dbActor.legal_name,
            org_number: dbActor.org_number ?? null,
            country: dbActor.country ?? null,
            city: dbActor.city ?? null,
          }}
          onMerged={() => {
            // Reload profile to surface merged data
            window.location.reload();
          }}
        />
      )}

      {/* Part 2 / Prompt 5: permanently delete an archived (merged) actor. Admin-only. */}
      {source === "database" && dbActor?.verification_status === "merged_into_other" && (
        <Dialog open={deleteArchivedOpen} onOpenChange={setDeleteArchivedOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Permanently delete {dbActor.legal_name}?</DialogTitle>
              <DialogDescription>
                This cannot be undone. The merge audit history will be preserved.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={deleteArchivedReason}
              onChange={(e) => setDeleteArchivedReason(e.target.value)}
              placeholder="Reason (optional)…"
              rows={3}
            />
            <DialogFooter>
              <Button variant="ghost" disabled={deleteArchivedBusy} onClick={() => setDeleteArchivedOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteArchivedBusy}
                onClick={async () => {
                  if (!dbActor) return;
                  setDeleteArchivedBusy(true);
                  const { error } = await (supabase.rpc as any)("fn_delete_archived_actor", {
                    p_actor_id: dbActor.id,
                    p_reason: deleteArchivedReason || null,
                  });
                  setDeleteArchivedBusy(false);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  toast.success("Actor permanently deleted");
                  setDeleteArchivedOpen(false);
                  navigate("/actors");
                }}
              >
                {deleteArchivedBusy ? "Deleting…" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Part 2 / Prompt 2: registry refresh — feeds DB-side edit draft, no auto-write. */}
      {source === "database" && dbActor && dbDraft && (
        <RegistryRefreshDialog
          open={registryRefreshOpen}
          onOpenChange={setRegistryRefreshOpen}
          current={{
            legal_name: dbDraft.legal_name || null,
            org_number: dbDraft.org_number || null,
            street_address: dbDraft.street_address || null,
            city: dbDraft.city || null,
            region: dbDraft.region || null,
            country: dbDraft.country || null,
            actor_website: null,
          }}
          onApply={(field, value) => {
            setDbDraft((prev) => {
              if (!prev) return prev;
              if (field === "actor_website") return prev;
              return { ...prev, [field]: value };
            });
          }}
        />
      )}

      {source === "database" && id && mediaEditor && (
        <MediaSlotEditor
          open={!!mediaEditor}
          onOpenChange={(o) => !o && setMediaEditor(null)}
          actorId={id}
          slotType={mediaEditor.slot}
          defaultQuery={mediaEditor.defaultQuery ?? name}
          linkedProductName={mediaEditor.linkedProductName}
          onSave={() => {
            setMediaEditor(null);
            void handleMediaSaved();
          }}
        />
      )}
    </div>
  );
};


export default ActorProfile;
