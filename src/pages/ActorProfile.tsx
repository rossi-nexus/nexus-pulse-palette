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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TagInput } from "@/components/nexus/TagInput";
import { ConfirmActorActionDialog } from "@/components/nexus/ConfirmActorActionDialog";
import { EnrichmentToolbar } from "@/components/nexus/EnrichmentToolbar";
import { appendManualOntologyItems } from "@/lib/actorEnrichment";
import type { SectionKey } from "@/config/enrichmentMethods";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Source = "personal" | "database";

interface PersonalActor {
  id: string;
  user_id: string;
  actor_name: string;
  actor_type: string | null;
  actor_description: string | null;
  actor_website: string | null;
  country: string | null;
  source_step: string | null;
  source_session_id: string | null;
  source_urls: string[] | null;
  profile_completeness: number | null;
  matched_main_db_actor_id: string | null;
  match_timestamp: string | null;
  analysis_data: Record<string, unknown> | null;
  search_data: Record<string, unknown> | null;
  status: string;
  notes: string | null;
  tags: string[] | null;
  suggested_at: string | null;
  created_at: string;
}

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

/** Normalize various ontology shapes from analysis_data JSONB into flat strings. */
function flattenOntologyArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      // Category-with-entries shape
      if (Array.isArray(o.entries)) {
        for (const e of o.entries) {
          if (typeof e === "string") out.push(e);
          else if (e && typeof e === "object") {
            const eo = e as Record<string, unknown>;
            const name = eo.entryName ?? eo.name ?? eo.rawName;
            if (typeof name === "string") out.push(name);
          }
        }
        continue;
      }
      const name =
        o.entryName ??
        o.categoryName ??
        o.domainName ??
        o.productName ??
        o.serviceName ??
        o.name ??
        o.rawName;
      if (typeof name === "string") out.push(name);
    }
  }
  return out;
}

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

  // Manual ontology entry — which ontology section is in add mode + the draft
  type OntologyKey = "capabilities" | "competences" | "domains" | "products" | "services";
  const [addingOntology, setAddingOntology] = useState<OntologyKey | null>(null);
  const [ontologyDraft, setOntologyDraft] = useState<string[]>([]);
  const [savingOntology, setSavingOntology] = useState(false);

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

  // Derive ontology lists per source
  const ontology = useMemo(() => {
    if (source === "personal" && personal) {
      const ad = (personal.analysis_data ?? {}) as Record<string, unknown>;
      return {
        capabilities: flattenOntologyArray(ad.capabilities),
        competences: flattenOntologyArray(ad.competences),
        domains: flattenOntologyArray(ad.domains),
        products: flattenOntologyArray(ad.products),
        services: flattenOntologyArray(ad.services),
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
  }, [source, personal, ontologyTags]);

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

  const hasIdentity = Boolean(
    name ||
      country ||
      dbActor?.org_number ||
      dbActor?.trade_names?.length ||
      dbActor?.street_address ||
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
          <ProfileSection title="Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <IdentityRow label="Legal name" value={name} />
              {dbActor?.trade_names && dbActor.trade_names.length > 0 && (
                <IdentityRow
                  label="Trade names"
                  value={dbActor.trade_names.join(", ")}
                />
              )}
              <IdentityRow label="Org number" value={dbActor?.org_number} />
              <IdentityRow label="Country" value={country} />
              {dbActor && (
                <IdentityRow
                  label="Address"
                  value={
                    [dbActor.street_address, dbActor.city, dbActor.region]
                      .filter(Boolean)
                      .join(", ") || null
                  }
                />
              )}
              {actorType && (
                <IdentityRow label="Type" value={TYPE_LABEL[actorType] ?? actorType} />
              )}
              {website && <IdentityRow label="Website" value={website} />}
            </div>
          </ProfileSection>
        )}

        {ontology.capabilities.length > 0 && (
          <ProfileSection title="Capabilities" count={ontology.capabilities.length}>
            <TagList items={ontology.capabilities} />
          </ProfileSection>
        )}
        {ontology.competences.length > 0 && (
          <ProfileSection title="Competences" count={ontology.competences.length}>
            <TagList items={ontology.competences} />
          </ProfileSection>
        )}
        {ontology.domains.length > 0 && (
          <ProfileSection title="Domains" count={ontology.domains.length}>
            <TagList items={ontology.domains} />
          </ProfileSection>
        )}
        {ontology.products.length > 0 && (
          <ProfileSection title="Products" count={ontology.products.length}>
            <TagList items={ontology.products} />
          </ProfileSection>
        )}
        {ontology.services.length > 0 && (
          <ProfileSection title="Services" count={ontology.services.length}>
            <TagList items={ontology.services} />
          </ProfileSection>
        )}

        {/* Classification */}
        {(source === "database" ? classifications : personalDerived.classification).length > 0 && (
          <ProfileSection title="Security Classification">
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
        <ProfileSection title="Source & Provenance">
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
