import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Interpretation, Constraints } from "@/types/interpretation";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences, resolveAxisWeights, type AxisWeights } from "@/hooks/useUserPreferences";
import { useTrackInteraction } from "@/hooks/useTrackInteraction";
import { resolveIntentCountries, type SourcingIntent } from "@/config/regionSets";
import { normalizeCountry, expandCountryAliases } from "@/lib/normalizeCountry";

export type SearchStatus = "not_started" | "searching" | "reviewing" | "locked";
type RoleStatus = "waiting" | "searching" | "complete" | "error";

export interface SearchSource {
  url: string;
  title: string;
  type: "company_website" | "news" | "directory" | "government" | "linkedin" | "other";
  credibility: "high" | "medium" | "low";
}

export type ActorTypeTag = "commercial" | "government" | "academic" | "industry_body";

/** B3: per-role source-of-truth toggle for Step 3. */
export type RoleSearchMode = "web" | "db" | "both";

export interface ActorCardData {
  id: string;
  name: string;
  location?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  description: string;
  match_strength: "strong" | "moderate" | "weak";
  actor_type: ActorTypeTag;
  classification_found?: string;
  standards_found?: string[];
  sources: SearchSource[];
  evidence_snippets: string[];
  triage_decision?: "included" | "saved_for_later";
  cross_role: boolean;
  cross_role_ids?: string[];
  /** B3 — provenance for downstream steps and audit logging. */
  source?: "web" | "db";
  /** B3 — set when source === "db". Stable link to public.actors.id. */
  db_actor_id?: string | null;
  /** B3 — rank metric from fn_rank_actors_by_ontology_overlap (db source only). */
  ontology_overlap_count?: number;
  /**
   * Verification lifecycle pulled from a matched DB actor.
   */
  matched_verified_at?: string | null;
  matched_decays_at?: string | null;
  /** P11 — composite relevance score [0,1] from fn_compute_actor_relevance_score. */
  relevance_score?: number | null;
  /** P11 — recorded modifier breakdown for hover-explain on the card. */
  relevance_breakdown?: {
    overlap?: number;
    outcome?: number;
    decay?: number;
    // AX3a — v2 axis breakdown (jsonb passthrough). AX3b renders.
    [axis: string]: any;
  } | null;
  /** P11 — per-role weighted match strength used by cross-role ranking. */
  cross_role_score?: number;
  /** P11 — per-role match-strength inputs feeding cross_role_score. */
  cross_role_strengths?: Array<{ role_id: string; role_name: string; strength: "strong" | "moderate" | "weak" }>;
}

// P11 — match strength → weight used by both per-role and cross-role scoring.
const STRENGTH_WEIGHT: Record<ActorCardData["match_strength"], number> = {
  strong: 1.0,
  moderate: 0.6,
  weak: 0.3,
};

export interface RoleSearchResult {
  role_id: string;
  role_name: string;
  status: RoleStatus;
  actors: ActorCardData[];
  queries_used: string[];
  /** Includes db / both for B3 modes. "ai_only" kept for legacy edge-function fallback. */
  search_mode: RoleSearchMode | "ai_only";
  processing_time_ms?: number;
  error?: string;
  /** SX-04 — web/DB actors excluded by sourcing intent hard filter (countries not in allowed set). */
  excluded_by_sourcing?: number;
  /** SX-04b — actors whose country could not be normalised; surfaced separately, not excluded. */
  country_unverified_count?: number;
  /** SX-04 — the sourcing intent under which this role was searched. */
  sourcing_intent?: SourcingIntent | null;
}

interface UseSearchProps {
  sessionId: string | null;
  /** AX4 — optional per-search override (e.g. from saved search). */
  axisWeightsOverride?: Partial<AxisWeights> | null;
}

export function useSearch({ sessionId, axisWeightsOverride = null }: UseSearchProps = { sessionId: null }) {
  const { user } = useAuth();
  const { weights: userDefaultWeights } = useUserPreferences();
  const track = useTrackInteraction(sessionId);

  const [status, setStatus] = useState<SearchStatus>("not_started");
  const [roleResults, setRoleResults] = useState<Map<string, RoleSearchResult>>(new Map());
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** B3: per-role mode toggle. Defaults to "web" to match legacy behaviour. */
  const [roleSearchModes, setRoleSearchModes] = useState<Map<string, RoleSearchMode>>(new Map());

  /** AX4 — resolved weights for v2 RPC: override → user default → null (system default). */
  const resolvedWeights = useMemo(
    () => resolveAxisWeights(axisWeightsOverride, userDefaultWeights),
    [axisWeightsOverride, userDefaultWeights],
  );

  const setRoleSearchMode = useCallback((roleId: string, mode: RoleSearchMode) => {
    setRoleSearchModes(prev => {
      const next = new Map(prev);
      next.set(roleId, mode);
      return next;
    });
  }, []);

  // Load existing locked state from DB on init
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("session_step_states")
          .select("*")
          .eq("session_id", sessionId)
          .eq("step", "A3")
          .maybeSingle();
        if (error) throw error;
        if (cancelled || !data) return;
        const output = data.locked_output as { roleResults?: RoleSearchResult[] } | null;
        if (data.status === "locked" && output?.roleResults) {
          const restored = new Map<string, RoleSearchResult>();
          for (const r of output.roleResults) restored.set(r.role_id, r);
          setRoleResults(restored);
          setStatus("locked");
        }
      } catch (e: any) {
        if (!cancelled) toast.error(`Failed to load Step 3 state: ${e?.message ?? "Unknown error"}`);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const startSearch = useCallback(async (interpretation: Interpretation) => {
    setStatus("searching");
    setError(null);

    const roles = interpretation.roles.filter(r => r.status === "accepted");
    if (roles.length === 0) {
      setError("No accepted roles to search");
      setStatus("not_started");
      return;
    }

    // Init all roles as waiting
    const initial = new Map<string, RoleSearchResult>();
    for (const role of roles) {
      initial.set(role.id, {
        role_id: role.id,
        role_name: role.name,
        status: "waiting",
        actors: [],
        queries_used: [],
        search_mode: "web",
      });
    }
    setRoleResults(new Map(initial));

    let firstCompleted = false;

    // Process sequentially
    for (const role of roles) {
      const mode: RoleSearchMode = roleSearchModes.get(role.id) ?? "web";

      setActiveRoleId(role.id);
      setRoleResults(prev => {
        const next = new Map(prev);
        const existing = next.get(role.id)!;
        next.set(role.id, { ...existing, status: "searching", search_mode: mode });
        return next;
      });

      // Collect selected targets once (used by both branches).
      const selectedTargets = (selections: any[]) =>
        selections.filter((s: any) => s.selected);
      const selectedAll = [
        ...selectedTargets(role.targets.capabilities),
        ...selectedTargets(role.targets.competences),
        ...selectedTargets(role.targets.domains),
        ...selectedTargets(role.targets.productTypes),
        ...selectedTargets(role.targets.serviceTypes),
      ];
      const targetEntryIds: string[] = selectedAll
        .map((s: any) => s.entryId)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0);

      // SX-04 — Sourcing intent → expanded country set for both DB pre-filter
      // and web post-filter. Null means "no hard filter" (unrestricted/absent).
      const sourcingIntent: SourcingIntent | undefined =
        (interpretation.constraints as any)?.geography?.sourcing_intent;
      const declaredCountries: string[] | undefined =
        (interpretation.constraints as any)?.geography?.countries;
      const intentCountries = resolveIntentCountries(sourcingIntent ?? null, declaredCountries);

      let webActors: ActorCardData[] = [];
      let dbActors: ActorCardData[] = [];
      let queriesUsed: string[] = [];
      let processingTimeMs: number | undefined;
      let errMsg: string | undefined;
      let excludedBySourcing = 0;
      let countryUnverifiedCount = 0;

      // --- Web branch -----------------------------------------------------
      if (mode === "web" || mode === "both") {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error("Not authenticated");

          const buildTargets = (selections: any[]) =>
            selections
              .filter((s: any) => s.selected)
              .map((s: any) => ({
                ontology_entry_id: s.entryId,
                selected: true,
                entry_name: s.rawName,
              }));

          const payload = {
            role: {
              id: role.id,
              name: role.name,
              description: role.description || '',
              reasoning: role.reasoning || '',
              targets: {
                capabilities: buildTargets(role.targets.capabilities),
                competences: buildTargets(role.targets.competences),
                domains: buildTargets(role.targets.domains),
                product_types: buildTargets(role.targets.productTypes),
                service_types: buildTargets(role.targets.serviceTypes),
              },
            },
            constraints: {
              ...interpretation.constraints,
              // SX-04 — make sure sourcing_intent travels with constraints.
              geography: {
                ...((interpretation.constraints as any)?.geography ?? {}),
                ...(sourcingIntent ? { sourcing_intent: sourcingIntent } : {}),
              },
            },
            // B3 fix: pass the real session id instead of the literal "current".
            session_id: sessionId ?? null,
          };

          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-role`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify(payload),
            }
          );

          if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({ error: "Unknown error" }));
            throw new Error(errBody.error || `HTTP ${resp.status}`);
          }

          const data = await resp.json();
          queriesUsed = data.queries_used || [];
          processingTimeMs = data.processing_time_ms;
          if (data.error) errMsg = data.error;

          webActors = (data.actors || []).map((a: any) => ({
            id: a.id || crypto.randomUUID(),
            name: a.name,
            location: a.location,
            country: a.country,
            website: a.website,
            description: a.description,
            match_strength: a.match_strength || "moderate",
            actor_type: (a.actor_type as ActorTypeTag) || "commercial",
            classification_found: a.classification_found,
            standards_found: a.standards_found,
            sources: a.sources || [],
            evidence_snippets: a.evidence_snippets || [],
            triage_decision: undefined,
            cross_role: false,
            source: "web" as const,
            db_actor_id: null,
          }));

          // SX-04 — Post-filter web results by sourcing intent. Out-of-scope actors
          // are excluded but counted so the UI can surface "N excluded by sourcing
          // constraint" rather than silently dropping them.
          if (intentCountries && intentCountries.length > 0) {
            const allowed = new Set(intentCountries.map((c) => c.toUpperCase()));
            const before = webActors.length;
            webActors = webActors.filter((a) => {
              const c = (a.country || "").toUpperCase().trim();
              return c && allowed.has(c);
            });
            excludedBySourcing += before - webActors.length;
          }
        } catch (err: any) {
          errMsg = err?.message ?? String(err);
        }
      }

      // --- DB branch ------------------------------------------------------
      if ((mode === "db" || mode === "both") && targetEntryIds.length > 0) {
        try {
          // SX-04 — DB pre-filter uses intent-expanded countries when intent is set,
          // otherwise falls back to user-declared countries (legacy behaviour).
          const declared = (interpretation.constraints as any)?.geography?.countries;
          const pCountries: string[] | null =
            intentCountries && intentCountries.length > 0
              ? intentCountries
              : (Array.isArray(declared) && declared.length > 0
                  ? declared.map((c: string) => c.toUpperCase())
                  : null);

          const { data, error: rpcErr } = await (supabase.rpc as any)(
            "fn_rank_actors_by_ontology_overlap",
            { p_entry_ids: targetEntryIds, p_limit: 20, p_countries: pCountries },
          );
          if (rpcErr) throw rpcErr;
          const rawRows: any[] = data || [];

          // AX3a: single v2 RPC call per role, scoring all actor_ids at once (kills N+1).
          const actorIds = rawRows.map((r: any) => r.actor_id);
          const constraintsPayload: Record<string, unknown> = {
            ontology_entry_ids: targetEntryIds,
            geography: {
              ...(pCountries ? { countries: pCountries } : {}),
              ...(sourcingIntent ? { sourcing_intent: sourcingIntent } : {}),
            },
            resilience: (interpretation.constraints as any)?.resilience ?? {},
            capacity: (interpretation.constraints as any)?.capacity ?? {},
            certifications: (interpretation.constraints as any)?.certifications ??
              (interpretation.constraints as any)?.standards ?? {},
          };

          let scoresById = new Map<string, { total: number; breakdown: any }>();
          if (actorIds.length > 0) {
            const { data: scoreRows, error: scoreErr } = await (supabase.rpc as any)(
              "fn_compute_actor_relevance_score_v2",
              {
                p_actor_ids: actorIds,
                p_constraints: constraintsPayload,
                p_weights: resolvedWeights, // AX4
                p_user_id: user?.id ?? null, // AX4 — engagement subscore
              },
            );
            if (scoreErr) throw scoreErr;
            for (const s of (scoreRows || []) as any[]) {
              scoresById.set(s.actor_id, { total: Number(s.total_score), breakdown: s.breakdown });
            }
          }

          const built = rawRows.map((row: any) => {
            const website: string | undefined = Array.isArray(row.websites) && row.websites.length > 0
              ? row.websites[0]
              : undefined;
            const locationBits = [row.city, row.region, row.country].filter(Boolean);
            const overlap = Number(row.overlap_count) || 0;
            const score = scoresById.get(row.actor_id);
            return {
              id: `db:${row.actor_id}`,
              name: row.legal_name,
              location: locationBits.join(", ") || undefined,
              country: row.country ?? undefined,
              latitude: row.latitude != null ? Number(row.latitude) : undefined,
              longitude: row.longitude != null ? Number(row.longitude) : undefined,
              website,
              description: `${Array.isArray(row.matched_entry_ids) ? row.matched_entry_ids.length : 0} of ${targetEntryIds.length} tags matched`,
              match_strength: overlap >= 2.5 ? "strong" : overlap >= 1.4 ? "moderate" : "weak",
              actor_type: "commercial" as ActorTypeTag,
              sources: website ? [{ url: website, title: row.legal_name, type: "company_website" as const, credibility: "high" as const }] : [],
              evidence_snippets: [],
              triage_decision: undefined,
              cross_role: false,
              source: "db" as const,
              db_actor_id: row.actor_id,
              ontology_overlap_count: overlap,
              matched_verified_at: row.verified_at,
              matched_decays_at: row.decays_at,
              relevance_score: score?.total ?? null,
              relevance_breakdown: score?.breakdown ?? null,
            } as ActorCardData;
          });
          built.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
          dbActors = built;
          // SX-04 — DB rows that came back with an exclusion-by-sourcing breakdown
          // are counted (the v2 RPC marks excluded actors as total_score=0 + breakdown.excluded_by_sourcing_constraint).
          const excludedDb = Array.from(scoresById.values()).filter((s: any) => s.breakdown?.excluded_by_sourcing_constraint).length;
          excludedBySourcing += excludedDb;
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          errMsg = errMsg ? `${errMsg}; db: ${msg}` : `db: ${msg}`;
        }
      }

      // --- Merge (both): dedupe web rows whose website matches a db row --
      let actors: ActorCardData[];
      if (mode === "both") {
        const dbWebsites = new Set(
          dbActors.map(a => (a.website || "").toLowerCase()).filter(Boolean),
        );
        const filteredWeb = webActors.filter(
          a => !a.website || !dbWebsites.has(a.website.toLowerCase()),
        );
        actors = [...dbActors, ...filteredWeb];
      } else if (mode === "db") {
        actors = dbActors;
      } else {
        actors = webActors;
      }

      const isError = !!errMsg && actors.length === 0;

      setRoleResults(prev => {
        const next = new Map(prev);
        next.set(role.id, {
          role_id: role.id,
          role_name: role.name,
          status: isError ? "error" : "complete",
          actors,
          queries_used: queriesUsed,
          search_mode: mode,
          processing_time_ms: processingTimeMs,
          error: errMsg,
          excluded_by_sourcing: excludedBySourcing,
          sourcing_intent: sourcingIntent ?? null,
        });
        return next;
      });

      if (!firstCompleted && !isError) {
        setExpandedRoleId(role.id);
        firstCompleted = true;
      }
    }

    setActiveRoleId(null);

    // Cross-role detection
    setRoleResults(prev => {
      const next = new Map(prev);
      const allActors: { roleId: string; actor: ActorCardData }[] = [];
      for (const [roleId, result] of next) {
        for (const actor of result.actors) {
          allActors.push({ roleId, actor });
        }
      }

      // Group by normalized name
      const nameGroups = new Map<string, { roleId: string; actor: ActorCardData }[]>();
      for (const item of allActors) {
        const key = item.actor.name.toLowerCase().trim();
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key)!.push(item);
      }

      for (const [, group] of nameGroups) {
        if (group.length > 1) {
          // P11 — weighted cross-role score:
          //   total = SUM(per-role match strength weight) * (log(1 + role_count) + 1)
          const roleCount = group.length;
          const roleCountFactor = Math.log(1 + roleCount) + 1;
          const sumStrength = group.reduce(
            (acc, g) => acc + (STRENGTH_WEIGHT[g.actor.match_strength] ?? 0.3),
            0,
          );
          const score = sumStrength * roleCountFactor;
          const strengths = group.map(g => {
            const rr = next.get(g.roleId);
            return {
              role_id: g.roleId,
              role_name: rr?.role_name ?? g.roleId,
              strength: g.actor.match_strength,
            };
          });
          const roleIds = group.map(g => g.roleId);
          for (const item of group) {
            item.actor.cross_role = true;
            item.actor.cross_role_ids = roleIds.filter(id => id !== item.roleId);
            item.actor.cross_role_score = score;
            item.actor.cross_role_strengths = strengths;
          }
        }
      }

      // P11 — sort each role's actors so cross-role actors (highest weighted score)
      // surface above non-cross-role actors. Stable within tier.
      for (const [roleId, result] of next) {
        const sorted = [...result.actors].sort((a, b) => {
          const aCross = a.cross_role_score ?? 0;
          const bCross = b.cross_role_score ?? 0;
          if (aCross !== bCross) return bCross - aCross;
          const aRel = a.relevance_score ?? 0;
          const bRel = b.relevance_score ?? 0;
          return bRel - aRel;
        });
        next.set(roleId, { ...result, actors: sorted });
      }

      return next;
    });

    setStatus("reviewing");
  }, [sessionId, roleSearchModes, resolvedWeights, user?.id]);

  /**
   * SX-04 — Re-run search for a single role while preserving every other role's
   * existing results and triage decisions. Used when an Axis change rescopes a
   * role after Step 3 has already produced results.
   */
  const rerunRole = useCallback(async (roleId: string, interpretation: Interpretation) => {
    const role = interpretation.roles.find((r) => r.id === roleId && r.status === "accepted");
    if (!role) return;
    const singleRoleInterp: Interpretation = {
      ...interpretation,
      roles: [role],
    } as Interpretation;
    // Snapshot the existing roleResults for OTHER roles so they survive the run.
    const preserved = new Map<string, RoleSearchResult>();
    setRoleResults((prev) => {
      for (const [rid, r] of prev) {
        if (rid !== roleId) preserved.set(rid, r);
      }
      return prev;
    });
    // Run the single-role search through the same pipeline, then restore others.
    setStatus("searching");
    await startSearch(singleRoleInterp);
    setRoleResults((prev) => {
      const next = new Map<string, RoleSearchResult>();
      // Other roles first (preserving original ordering & state).
      for (const [rid, r] of preserved) next.set(rid, r);
      // Then the newly-searched role (whatever startSearch produced).
      const fresh = prev.get(roleId);
      if (fresh) next.set(roleId, fresh);
      return next;
    });
    setStatus("reviewing");
  }, [startSearch]);

  // Triage actions
  const includeActor = useCallback((roleId: string, actorId: string) => {
    let dbActorIncluded: { db_actor_id: string; role_name: string; meta: Record<string, unknown> } | null = null;
    let trackedActorId: string | null = null;
    let trackedMeta: Record<string, unknown> = {};
    setRoleResults(prev => {
      const next = new Map(prev);
      const result = next.get(roleId);
      if (!result) return prev;
      const target = result.actors.find(a => a.id === actorId);
      if (target) {
        const rank = result.actors.findIndex(a => a.id === actorId);
        trackedMeta = {
          role_id: roleId,
          role_name: result.role_name,
          result_rank: rank,
          total_score: target.relevance_score ?? null,
          source: target.source ?? null,
        };
        trackedActorId = target.db_actor_id || actorId;
        if (target.source === "db" && target.db_actor_id) {
          dbActorIncluded = { db_actor_id: target.db_actor_id, role_name: result.role_name, meta: trackedMeta };
        }
      }
      next.set(roleId, {
        ...result,
        actors: result.actors.map(a =>
          a.id === actorId ? { ...a, triage_decision: "included" as const } : a
        ),
      });
      return next;
    });
    // AX4 — implicit interaction
    if (trackedActorId) track(trackedActorId, "included", trackedMeta);
    // B3 — audit moat
    if (dbActorIncluded) {
      const { db_actor_id, role_name } = dbActorIncluded;
      (supabase.rpc as any)("fn_audit_log_event", {
        p_event_type: "db_actor_included_in_pipeline",
        p_target_table: "actors",
        p_target_record_id: db_actor_id,
        p_actor_id: db_actor_id,
        p_programme_id: null,
        p_changes: { session_id: sessionId, role_id: roleId, role_name },
        p_reason: null,
      }).then(({ error }: { error: any }) => {
        if (error) console.warn("audit log (db_actor_included_in_pipeline) failed:", error.message);
      });
    }
  }, [sessionId, track]);

  const saveForLater = useCallback((roleId: string, actorId: string) => {
    let trackedActorId: string | null = null;
    let trackedMeta: Record<string, unknown> = {};
    setRoleResults(prev => {
      const next = new Map(prev);
      const result = next.get(roleId);
      if (!result) return prev;
      const target = result.actors.find(a => a.id === actorId);
      if (target) {
        trackedActorId = target.db_actor_id || actorId;
        trackedMeta = { role_id: roleId, role_name: result.role_name, total_score: target.relevance_score ?? null };
      }
      next.set(roleId, {
        ...result,
        actors: result.actors.map(a =>
          a.id === actorId ? { ...a, triage_decision: "saved_for_later" as const } : a
        ),
      });
      return next;
    });
    if (trackedActorId) track(trackedActorId, "saved_for_later", trackedMeta);
  }, [track]);

  const undoTriage = useCallback((roleId: string, actorId: string) => {
    let trackedActorId: string | null = null;
    let priorDecision: "included" | "saved_for_later" | undefined;
    setRoleResults(prev => {
      const next = new Map(prev);
      const result = next.get(roleId);
      if (!result) return prev;
      const target = result.actors.find(a => a.id === actorId);
      if (target) {
        trackedActorId = target.db_actor_id || actorId;
        priorDecision = target.triage_decision;
      }
      next.set(roleId, {
        ...result,
        actors: result.actors.map(a =>
          a.id === actorId ? { ...a, triage_decision: undefined } : a
        ),
      });
      return next;
    });
    if (trackedActorId && priorDecision === "included") {
      track(trackedActorId, "unincluded", { role_id: roleId });
    }
  }, [track]);

  /**
   * AX4 — Re-score a single actor after an outcome was recorded and update its
   * breakdown in the current result list. Uses the resolved weight set.
   */
  const rescoreActor = useCallback(async (cardId: string) => {
    let dbActorId: string | null = null;
    let foundRoleId: string | null = null;
    for (const [rid, r] of roleResults) {
      const a = r.actors.find(x => x.id === cardId);
      if (a) {
        dbActorId = a.db_actor_id ?? null;
        foundRoleId = rid;
        break;
      }
    }
    if (!dbActorId || !foundRoleId) return;
    try {
      const { data, error } = await (supabase.rpc as any)(
        "fn_compute_actor_relevance_score_v2",
        {
          p_actor_ids: [dbActorId],
          p_constraints: {},
          p_weights: resolvedWeights,
          p_user_id: user?.id ?? null,
        },
      );
      if (error) throw error;
      const row = (data || [])[0];
      if (!row) return;
      setRoleResults(prev => {
        const next = new Map(prev);
        const r = next.get(foundRoleId!);
        if (!r) return prev;
        next.set(foundRoleId!, {
          ...r,
          actors: r.actors.map(a =>
            a.id === cardId
              ? { ...a, relevance_score: Number(row.total_score), relevance_breakdown: row.breakdown }
              : a,
          ),
        });
        return next;
      });
    } catch (e: any) {
      console.warn("rescoreActor failed:", e?.message ?? String(e));
    }
  }, [roleResults, resolvedWeights, user?.id]);


  const lock = useCallback(async () => {
    if (sessionId) {
      const now = new Date().toISOString();
      const lockedOutput = { roleResults: Array.from(roleResults.values()) };
      const { data: existing, error: selErr } = await supabase
        .from("session_step_states")
        .select("id")
        .eq("session_id", sessionId)
        .eq("step", "A3")
        .maybeSingle();
      if (selErr) {
        toast.error(`Lock failed: ${selErr.message}`);
        return;
      }
      if (existing) {
        const { error } = await supabase
          .from("session_step_states")
          .update({ status: "locked", locked_output: lockedOutput as any, locked_at: now })
          .eq("id", existing.id);
        if (error) {
          toast.error(`Lock failed: ${error.message}`);
          return;
        }
      } else {
        const { error } = await supabase.from("session_step_states").insert([{
          session_id: sessionId,
          step: "A3",
          status: "locked",
          locked_output: lockedOutput as any,
          locked_at: now,
        }]);
        if (error) {
          toast.error(`Lock failed: ${error.message}`);
          return;
        }
      }
    }
    setStatus("locked");
  }, [sessionId, roleResults]);

  const unlock = useCallback(async () => {
    if (sessionId) {
      const { error } = await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A3");
      if (error) {
        toast.error(`Unlock failed: ${error.message}`);
        return;
      }
    }
    setStatus("reviewing");
  }, [sessionId]);

  // Full reset — used by upstream cascade
  const reset = useCallback(async () => {
    if (sessionId) {
      const { error } = await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A3");
      if (error) toast.error(`Reset failed: ${error.message}`);
    }
    setStatus("not_started");
    setRoleResults(new Map());
    setActiveRoleId(null);
    setExpandedRoleId(null);
    setError(null);
    setRoleSearchModes(new Map());
  }, [sessionId]);

  // Computed
  const allActors = useMemo(() => {
    const actors: ActorCardData[] = [];
    for (const result of roleResults.values()) {
      actors.push(...result.actors);
    }
    return actors;
  }, [roleResults]);

  const totalFound = allActors.length;
  const totalIncluded = allActors.filter(a => a.triage_decision === "included").length;
  const totalSavedForLater = allActors.filter(a => a.triage_decision === "saved_for_later").length;
  const crossRoleCount = allActors.filter(a => a.cross_role).length;

  const allRolesComplete = useMemo(() => {
    if (roleResults.size === 0) return false;
    for (const result of roleResults.values()) {
      if (result.status === "waiting" || result.status === "searching") return false;
    }
    return true;
  }, [roleResults]);

  const allActorsTriaged = useMemo(() => {
    if (allActors.length === 0) return false;
    return allActors.every(a => a.triage_decision !== undefined);
  }, [allActors]);

  const canLock = allRolesComplete && allActorsTriaged;

  const orderedRoles = useMemo(() => {
    return Array.from(roleResults.values());
  }, [roleResults]);

  return {
    status,
    roleResults,
    orderedRoles,
    activeRoleId,
    expandedRoleId,
    error,
    totalFound,
    totalIncluded,
    totalSavedForLater,
    crossRoleCount,
    canLock,
    roleSearchModes,
    setRoleSearchMode,
    setExpandedRoleId,
    startSearch,
    includeActor,
    saveForLater,
    undoTriage,
    lock,
    unlock,
    reset,
    rescoreActor,
    rerunRole,
    resolvedWeights,
    track,

  };
}
