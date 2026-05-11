import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, FolderOpen, CheckCircle2, Search, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSessionContext } from "@/contexts/SessionContext";
import { useActorActions } from "@/hooks/useActorActions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ConfirmActorActionDialog } from "@/components/nexus/ConfirmActorActionDialog";
import VerifiedStatusBadge from "@/components/nexus/VerifiedStatusBadge";
import type { PersonalActor } from "@/types/personal-actor";
import type { DbActor } from "@/types/db-actor";
import { cn } from "@/lib/utils";

/** Subset of DbActor verification fields needed to render the badge. */
type DbVerification = Pick<DbActor, "verified_at" | "decays_at">;

type TabKey = "collection" | "database";

interface SessionInfo {
  id: string;
  name: string | null;
  created_at: string;
}

const ACTOR_TYPE_VARIANT: Record<string, string> = {
  commercial: "bg-success/15 text-success border-success/30",
  government: "bg-info/15 text-info border-info/30",
  academic: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
  industry_body: "bg-warning/15 text-warning border-warning/30",
};

const ACTOR_TYPE_LABEL: Record<string, string> = {
  commercial: "Commercial",
  government: "Government",
  academic: "Academic",
  industry_body: "Industry Body",
};

function formatDateShort(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString("en-US", opts);
}

function arrayLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

const ActorsView = () => {
  const { user } = useAuth();
  const { isAdmin } = useSessionContext();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("collection");
  const [loading, setLoading] = useState(true);

  const [personal, setPersonal] = useState<PersonalActor[]>([]);
  const [dbActors, setDbActors] = useState<DbActor[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  // Verification lifecycle data for matched DB actors (used by personal cards)
  const [matchedVerification, setMatchedVerification] = useState<Map<string, DbVerification>>(new Map());

  // Action dialogs (personal actors)
  const [actionTarget, setActionTarget] = useState<PersonalActor | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { busy, suggestForDb, deleteFromCollection } = useActorActions();

  const openSuggest = (a: PersonalActor) => {
    setActionTarget(a);
    setSuggestOpen(true);
  };
  const openDelete = (a: PersonalActor) => {
    setActionTarget(a);
    setDeleteOpen(true);
  };

  // Filters
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [type, setType] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [verified, setVerified] = useState("all");
  const [sort, setSort] = useState("recent");

  // Reset filters on tab change
  useEffect(() => {
    setSearch("");
    setCountry("all");
    setType("all");
    setSessionFilter("all");
    setVerified("all");
    setSort("recent");
  }, [tab]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchMatchedVerification = async (list: PersonalActor[]) => {
      const ids = Array.from(
        new Set(
          list
            .map((a) => a.matched_main_db_actor_id)
            .filter((x): x is string => !!x),
        ),
      );
      if (ids.length === 0) {
        if (!cancelled) setMatchedVerification(new Map());
        return;
      }
      const { data, error } = await supabase
        .from("actors")
        .select("id, verified_at, decays_at")
        .in("id", ids);
      if (cancelled) return;
      if (error) {
        toast.error(`Failed to load verification info: ${error.message}`);
        return;
      }
      const m = new Map<string, DbVerification>();
      (data ?? []).forEach((row) =>
        m.set(row.id, { verified_at: row.verified_at, decays_at: row.decays_at }),
      );
      setMatchedVerification(m);
    };

    (async () => {
      setLoading(true);
      try {
        if (tab === "collection") {
          const [actorsRes, sessRes] = await Promise.all([
            supabase
              .from("user_personal_actors")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false }),
            supabase
              .from("search_sessions")
              .select("id, name, created_at")
              .eq("user_id", user.id),
          ]);
          if (cancelled) return;
          if (actorsRes.error) {
            toast.error(`Failed to load collection: ${actorsRes.error.message}`);
          }
          if (sessRes.error) {
            toast.error(`Failed to load sessions: ${sessRes.error.message}`);
          }
          const list = (actorsRes.data ?? []) as unknown as PersonalActor[];
          setPersonal(list);
          setSessions((sessRes.data ?? []) as SessionInfo[]);
          await fetchMatchedVerification(list);
        } else if (tab === "database") {
          const { data, error } = await supabase
            .from("actors")
            .select(
              "id, legal_name, org_number, country, websites, verification_status, verified_at, decays_at, data_completeness, source, created_at, updated_at",
            )
            .order("updated_at", { ascending: false });
          if (cancelled) return;
          if (error) {
            toast.error(`Failed to load database: ${error.message}`);
          }
          setDbActors((data ?? []) as DbActor[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, user, isAdmin]);

  const sessionMap = useMemo(() => {
    const m = new Map<string, SessionInfo>();
    sessions.forEach((s) => m.set(s.id, s));
    return m;
  }, [sessions]);

  // ---------- Collection filtering ----------
  const filteredCollection = useMemo(() => {
    let list = [...personal];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.actor_name.toLowerCase().includes(q));
    }
    if (country !== "all") list = list.filter((a) => a.country === country);
    if (type !== "all") list = list.filter((a) => a.actor_type === type);
    if (sessionFilter !== "all")
      list = list.filter((a) => a.source_session_id === sessionFilter);

    switch (sort) {
      case "name_asc":
        list.sort((a, b) => a.actor_name.localeCompare(b.actor_name));
        break;
      case "name_desc":
        list.sort((a, b) => b.actor_name.localeCompare(a.actor_name));
        break;
      case "completeness":
        list.sort(
          (a, b) => (b.profile_completeness ?? 0) - (a.profile_completeness ?? 0),
        );
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }
    return list;
  }, [personal, search, country, type, sessionFilter, sort]);

  const filteredDatabase = useMemo(() => {
    let list = [...dbActors];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.legal_name.toLowerCase().includes(q));
    }
    if (country !== "all") list = list.filter((a) => a.country === country);
    if (verified !== "all")
      list = list.filter((a) => a.verification_status === verified);

    switch (sort) {
      case "name_asc":
        list.sort((a, b) => a.legal_name.localeCompare(b.legal_name));
        break;
      case "name_desc":
        list.sort((a, b) => b.legal_name.localeCompare(a.legal_name));
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
    }
    return list;
  }, [dbActors, search, country, verified, sort]);

  // Distinct countries for filter
  const collectionCountries = useMemo(
    () =>
      Array.from(new Set(personal.map((a) => a.country).filter(Boolean))).sort() as string[],
    [personal],
  );
  const dbCountries = useMemo(
    () =>
      Array.from(new Set(dbActors.map((a) => a.country).filter(Boolean))).sort() as string[],
    [dbActors],
  );

  const filtersActive =
    search.trim() !== "" ||
    country !== "all" ||
    type !== "all" ||
    sessionFilter !== "all" ||
    verified !== "all";

  function clearFilters() {
    setSearch("");
    setCountry("all");
    setType("all");
    setSessionFilter("all");
    setVerified("all");
  }

  const totalForTab =
    tab === "collection" ? filteredCollection.length : filteredDatabase.length;

  const sessionsRepresented =
    tab === "collection"
      ? new Set(filteredCollection.map((a) => a.source_session_id).filter(Boolean)).size
      : 0;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <h1 className="text-2xl font-semibold text-foreground mb-6">Actors</h1>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-border">
          <TabButton active={tab === "collection"} onClick={() => setTab("collection")}>
            My Collection
          </TabButton>
          <TabButton active={tab === "database"} onClick={() => setTab("database")}>
            Database
          </TabButton>
          {/* Phase 6.5.5b: validation queue tab removed — superseded by /consultant/verification */}
        </div>

        {/* Search + Filters */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actors..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Country */}
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {(tab === "collection" ? collectionCountries : dbCountries).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type (collection + queue) */}
            {tab !== "database" && (
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                  <SelectItem value="academic">Academic</SelectItem>
                  <SelectItem value="industry_body">Industry Body</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Session (collection only) */}
            {tab === "collection" && (
              <Select value={sessionFilter} onValueChange={setSessionFilter}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sessions</SelectItem>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || "Untitled session"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Verification (database only) */}
            {tab === "database" && (
              <Select value={verified} onValueChange={setVerified}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="admin_verified">Admin Verified</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="unverified">Unverified</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Sort */}
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="name_desc">Name Z–A</SelectItem>
                {tab === "collection" && (
                  <SelectItem value="completeness">Completeness</SelectItem>
                )}
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* Result count */}
        {!loading && totalForTab > 0 && (
          <div className="text-xs uppercase tracking-wider text-foreground-secondary mb-3">
            {totalForTab} {totalForTab === 1 ? "actor" : "actors"}
            {tab === "collection" && sessionsRepresented > 0 && (
              <> · {sessionsRepresented} {sessionsRepresented === 1 ? "session" : "sessions"}</>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <LoadingSkeletons />
        ) : tab === "collection" ? (
          filteredCollection.length === 0 ? (
            personal.length === 0 ? (
              <EmptyCollection onGo={() => navigate("/pipeline")} />
            ) : (
              <NoResults onClear={clearFilters} />
            )
          ) : (
            <div className="space-y-3">
              {filteredCollection.map((a) => (
                <PersonalActorCard
                  key={a.id}
                  actor={a}
                  session={a.source_session_id ? sessionMap.get(a.source_session_id) : undefined}
                  matchedVerification={
                    a.matched_main_db_actor_id
                      ? matchedVerification.get(a.matched_main_db_actor_id)
                      : undefined
                  }
                  onClick={() => navigate(`/actors/${a.id}`)}
                  onSuggest={() => openSuggest(a)}
                  onDelete={() => openDelete(a)}
                  busy={busy}
                />
              ))}
            </div>
          )
        ) : tab === "database" ? (
          filteredDatabase.length === 0 ? (
            dbActors.length === 0 ? (
              <EmptyDatabase />
            ) : (
              <NoResults onClear={clearFilters} />
            )
          ) : (
            <div className="space-y-3">
              {filteredDatabase.map((a) => (
                <DatabaseActorCard
                  key={a.id}
                  actor={a}
                  onClick={() => navigate(`/actors/${a.id}`)}
                />
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* Confirmation dialogs */}
      {actionTarget && (
        <>
          <ConfirmActorActionDialog
            open={suggestOpen}
            onOpenChange={setSuggestOpen}
            title={`Suggest ${actionTarget.actor_name} for the main database?`}
            description="This is a one-way action. An administrator will review the suggestion and may approve or reject it. You won't be able to retract the suggestion, but it can be rejected."
            confirmLabel="Suggest"
            onConfirm={async () => {
              const target = actionTarget;
              const ok = await suggestForDb(target.id);
              setSuggestOpen(false);
              if (ok) {
                const nowIso = new Date().toISOString();
                setPersonal((prev) =>
                  prev.map((a) =>
                    a.id === target.id
                      ? { ...a, status: "suggested", suggested_at: nowIso }
                      : a,
                  ),
                );
              }
            }}
          />
          <ConfirmActorActionDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete ${actionTarget.actor_name} from your collection?`}
            description="This can't be undone. The actor stays in any search sessions where it was originally found."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              const target = actionTarget;
              const ok = await deleteFromCollection(target.id);
              setDeleteOpen(false);
              if (ok) {
                setPersonal((prev) => prev.filter((a) => a.id !== target.id));
              }
            }}
          />
        </>
      )}
    </div>
  );
};

// ---------- Sub-components ----------

const TabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
      active
        ? "border-accent-teal text-foreground"
        : "border-transparent text-foreground-secondary hover:text-foreground",
    )}
  >
    {children}
  </button>
);

const TypeBadge = ({ type }: { type: string | null }) => {
  if (!type) return null;
  const cls = ACTOR_TYPE_VARIANT[type] || "bg-muted/40 text-foreground-secondary border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border",
        cls,
      )}
    >
      {ACTOR_TYPE_LABEL[type] || type}
    </span>
  );
};

const PersonalActorCard = ({
  actor,
  session,
  matchedVerification,
  onClick,
  onSuggest,
  onDelete,
  busy,
}: {
  actor: PersonalActor;
  session?: SessionInfo;
  matchedVerification?: DbVerification;
  onClick: () => void;
  onSuggest: () => void;
  onDelete: () => void;
  busy: string | null;
}) => {
  const ad = (actor.analysis_data ?? {}) as Record<string, unknown>;
  const capCount = arrayLen(ad.capabilities);
  const domainCount = arrayLen(ad.domains);
  const isAnalyzed = actor.source_step === "analysis" || capCount > 0 || domainCount > 0;
  const completeness = actor.profile_completeness ?? 0;
  const isSuggested = actor.status === "suggested";
  const isMerged = actor.status === "merged";

  return (
    <div
      onClick={onClick}
      className="group relative bg-surface border border-border rounded-lg p-4 cursor-pointer hover:border-border-accent hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-foreground text-base leading-tight truncate">
            {actor.actor_name || "Unnamed actor"}
          </h3>
          {isSuggested && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
                    Pending review
                  </span>
                </TooltipTrigger>
                <TooltipContent>Suggested for main database — awaiting admin review</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isMerged && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-success/15 text-success border border-success/30">
                    In main database
                  </span>
                </TooltipTrigger>
                <TooltipContent>This actor is now part of the main database</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {actor.matched_main_db_actor_id && matchedVerification && (
            <VerifiedStatusBadge
              size="sm"
              verifiedAt={matchedVerification.verified_at}
              decaysAt={matchedVerification.decays_at}
            />
          )}
        </div>
        {actor.country && (
          <span className="text-xs text-foreground-muted whitespace-nowrap">{actor.country}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-foreground-secondary mb-2">
        <TypeBadge type={actor.actor_type} />
        <span>·</span>
        <span>{isAnalyzed ? "Analyzed" : "Saved for later"}</span>
        {(capCount > 0 || domainCount > 0) && (
          <>
            <span>·</span>
            {capCount > 0 && <span>{capCount} capabilities</span>}
            {capCount > 0 && domainCount > 0 && <span>·</span>}
            {domainCount > 0 && <span>{domainCount} domains</span>}
          </>
        )}
      </div>

      {session && (
        <div className="text-xs text-foreground-muted mb-2">
          From: {session.name || "Untitled session"} ({formatDateShort(session.created_at)})
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <Progress value={completeness} className="h-1.5 flex-1" />
        <span className="text-xs text-foreground-muted font-mono">{completeness}%</span>
      </div>

      {/* Action row — reserved height so the card doesn't jump on hover.
          Hidden by default, revealed on group-hover or focus-within. */}
      <div
        className="mt-3 h-7 flex justify-end gap-1.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <CardActionButton
          label="Suggest for DB"
          onClick={onSuggest}
          disabled={isSuggested || isMerged || busy === "suggest"}
          tip={
            isSuggested
              ? "Already suggested — awaiting admin review"
              : isMerged
                ? "Already in main database"
                : undefined
          }
        />
        <CardActionButton
          label="Delete"
          onClick={onDelete}
          disabled={isMerged || busy === "delete"}
          destructive
          tip={isMerged ? "Cannot delete — this actor is in the main database" : undefined}
        />
      </div>
    </div>
  );
};

const CardActionButton = ({
  label,
  onClick,
  disabled,
  tip,
  destructive,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tip?: string;
  destructive?: boolean;
}) => {
  const btn = (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 text-xs",
        destructive &&
          !disabled &&
          "text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {label}
    </Button>
  );
  if (!tip) return btn;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{btn}</span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const DatabaseActorCard = ({ actor, onClick }: { actor: DbActor; onClick: () => void }) => {
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border rounded-lg p-4 cursor-pointer hover:border-border-accent hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-foreground text-base leading-tight">
          {actor.legal_name}
        </h3>
        {actor.country && (
          <span className="text-xs text-foreground-muted whitespace-nowrap">{actor.country}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs text-foreground-secondary">
        <VerifiedStatusBadge
          size="sm"
          verifiedAt={actor.verified_at}
          decaysAt={actor.decays_at}
        />
        <span>·</span>
        <span className="text-foreground-muted">
          Last updated: {formatDateShort(actor.updated_at)}
        </span>
      </div>
    </div>
  );
};


const LoadingSkeletons = () => (
  <div className="space-y-3">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-3 w-3/5 mb-2" />
        <Skeleton className="h-3 w-2/5 mb-3" />
        <Skeleton className="h-1.5 w-full" />
      </div>
    ))}
  </div>
);

const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="bg-surface border border-border rounded-lg p-12 text-center">
    <div className="flex justify-center mb-4 text-foreground-muted">{icon}</div>
    <h3 className="text-base font-medium text-foreground mb-2">{title}</h3>
    <p className="text-sm text-foreground-secondary leading-relaxed mb-4 max-w-md mx-auto">
      {description}
    </p>
    {action}
  </div>
);

const EmptyCollection = ({ onGo }: { onGo: () => void }) => (
  <EmptyState
    icon={<FolderOpen className="w-12 h-12" />}
    title="No actors in your collection yet"
    description={
      <>
        Run a search pipeline and save actors from Step 5 to start building your
        collection.
      </>
    }
    action={
      <Button onClick={onGo} variant="default" size="sm">
        Go to Pipeline <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    }
  />
);

const EmptyDatabase = () => (
  <EmptyState
    icon={<Database className="w-12 h-12" />}
    title="No actors in the database yet"
    description="The database grows as actors are reviewed and promoted from user collections by administrators."
  />
);


const NoResults = ({ onClear }: { onClear: () => void }) => (
  <EmptyState
    icon={<Search className="w-12 h-12" />}
    title="No actors match your search"
    description="Try adjusting your filters or search terms."
    action={
      <Button onClick={onClear} variant="outline" size="sm">
        Clear filters
      </Button>
    }
  />
);

export default ActorsView;
