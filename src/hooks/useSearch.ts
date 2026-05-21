import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Interpretation, Constraints } from "@/types/interpretation";

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
}

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
}

interface UseSearchProps {
  sessionId: string | null;
}

export function useSearch({ sessionId }: UseSearchProps = { sessionId: null }) {
  const [status, setStatus] = useState<SearchStatus>("not_started");
  const [roleResults, setRoleResults] = useState<Map<string, RoleSearchResult>>(new Map());
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** B3: per-role mode toggle. Defaults to "web" to match legacy behaviour. */
  const [roleSearchModes, setRoleSearchModes] = useState<Map<string, RoleSearchMode>>(new Map());

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

      let webActors: ActorCardData[] = [];
      let dbActors: ActorCardData[] = [];
      let queriesUsed: string[] = [];
      let processingTimeMs: number | undefined;
      let errMsg: string | undefined;

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
            constraints: interpretation.constraints,
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
        } catch (err: any) {
          errMsg = err?.message ?? String(err);
        }
      }

      // --- DB branch ------------------------------------------------------
      if ((mode === "db" || mode === "both") && targetEntryIds.length > 0) {
        try {
          const { data, error: rpcErr } = await (supabase.rpc as any)(
            "fn_rank_actors_by_ontology_overlap",
            { p_entry_ids: targetEntryIds, p_limit: 20 },
          );
          if (rpcErr) throw rpcErr;
          dbActors = (data || []).map((row: any) => {
            const website: string | undefined = Array.isArray(row.websites) && row.websites.length > 0
              ? row.websites[0]
              : undefined;
            const locationBits = [row.city, row.region, row.country].filter(Boolean);
            return {
              id: `db:${row.actor_id}`,
              name: row.legal_name,
              location: locationBits.join(", ") || undefined,
              country: row.country ?? undefined,
              website,
              description: `Verified actor (${row.overlap_count} matching ontology tag${row.overlap_count === 1 ? "" : "s"}).`,
              match_strength: row.overlap_count >= 3 ? "strong" : row.overlap_count === 2 ? "moderate" : "weak",
              actor_type: "commercial" as ActorTypeTag,
              sources: website ? [{ url: website, title: row.legal_name, type: "company_website" as const, credibility: "high" as const }] : [],
              evidence_snippets: [],
              triage_decision: undefined,
              cross_role: false,
              source: "db" as const,
              db_actor_id: row.actor_id,
              ontology_overlap_count: row.overlap_count,
              matched_verified_at: row.verified_at,
              matched_decays_at: row.decays_at,
            } as ActorCardData;
          });
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
          const roleIds = group.map(g => g.roleId);
          for (const item of group) {
            item.actor.cross_role = true;
            item.actor.cross_role_ids = roleIds.filter(id => id !== item.roleId);
          }
        }
      }

      return next;
    });

    setStatus("reviewing");
  }, []);

  // Triage actions
  const includeActor = useCallback((roleId: string, actorId: string) => {
    setRoleResults(prev => {
      const next = new Map(prev);
      const result = next.get(roleId);
      if (!result) return prev;
      next.set(roleId, {
        ...result,
        actors: result.actors.map(a =>
          a.id === actorId ? { ...a, triage_decision: "included" as const } : a
        ),
      });
      return next;
    });
  }, []);

  const saveForLater = useCallback((roleId: string, actorId: string) => {
    setRoleResults(prev => {
      const next = new Map(prev);
      const result = next.get(roleId);
      if (!result) return prev;
      next.set(roleId, {
        ...result,
        actors: result.actors.map(a =>
          a.id === actorId ? { ...a, triage_decision: "saved_for_later" as const } : a
        ),
      });
      return next;
    });
  }, []);

  const undoTriage = useCallback((roleId: string, actorId: string) => {
    setRoleResults(prev => {
      const next = new Map(prev);
      const result = next.get(roleId);
      if (!result) return prev;
      next.set(roleId, {
        ...result,
        actors: result.actors.map(a =>
          a.id === actorId ? { ...a, triage_decision: undefined } : a
        ),
      });
      return next;
    });
  }, []);

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
    setExpandedRoleId,
    startSearch,
    includeActor,
    saveForLater,
    undoTriage,
    lock,
    unlock,
    reset,
  };
}
