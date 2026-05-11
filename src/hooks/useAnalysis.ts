import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ActorCardData, RoleSearchResult } from "@/hooks/useSearch";
import type { Constraints, Role } from "@/types/interpretation";
import type { ActorAnalysis, AnalyzedActor, AnalyzedActors } from "@/types/analyzed-actors";

export type AnalysisStatus = "not_started" | "analyzing" | "complete" | "locked";
export type ActorAnalysisRunStatus = "waiting" | "analyzing" | "complete" | "skipped" | "error";
export type RoleAnalysisRunStatus = "waiting" | "analyzing" | "complete" | "error";

export interface ActorAnalysisStatus {
  actor_id: string;
  actor_name: string;
  actor_type: string;
  status: ActorAnalysisRunStatus;
  result?: ActorAnalysis | null;
  error?: string;
  /** Carried over from Step 3 for display */
  source_actor: ActorCardData;
  processing_time_ms?: number;
}

export interface RoleAnalysisProgress {
  role_id: string;
  role_name: string;
  status: RoleAnalysisRunStatus;
  total_actors: number;
  completed_actors: number;
  actors: ActorAnalysisStatus[];
}

/** Normalised input the hook needs from upstream state. */
export interface AnalysisInput {
  /** Roles ordered by priority, with their accepted targets */
  roles: Role[];
  /** Per-role search results from Step 3 (with included actors only) */
  roleResults: RoleSearchResult[];
  /** Constraints from the locked interpretation */
  constraints: Constraints;
}

interface CallPayload {
  actor: {
    id: string;
    name: string;
    website?: string;
    description: string;
    actor_type: string;
    sources: { url: string; title: string }[];
    evidence_snippets: string[];
  };
  role: {
    id: string;
    name: string;
    targets: {
      capabilities: { entryId: string; rawName: string }[];
      competences: { entryId: string; rawName: string }[];
      domains: { entryId: string; rawName: string }[];
      productTypes: { entryId: string; rawName: string }[];
      serviceTypes: { entryId: string; rawName: string }[];
    };
  };
  constraints: Constraints;
}

function buildTargets(role: Role) {
  const pick = (arr: any[]) =>
    (arr || [])
      .filter((s: any) => s.selected && s.status !== "rejected")
      .map((s: any) => ({ entryId: s.entryId, rawName: s.rawName }));
  return {
    capabilities: pick(role.targets.capabilities),
    competences: pick(role.targets.competences),
    domains: pick(role.targets.domains),
    productTypes: pick(role.targets.productTypes),
    serviceTypes: pick(role.targets.serviceTypes),
  };
}

interface UseAnalysisProps {
  sessionId: string | null;
}

export function useAnalysis({ sessionId }: UseAnalysisProps = { sessionId: null }) {
  const [status, setStatus] = useState<AnalysisStatus>("not_started");
  const [roleProgress, setRoleProgress] = useState<Map<string, RoleAnalysisProgress>>(new Map());
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [activeActorId, setActiveActorId] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          .eq("step", "A4")
          .maybeSingle();
        if (error) throw error;
        if (cancelled || !data) return;
        const output = data.locked_output as { roleProgress?: RoleAnalysisProgress[] } | null;
        if (data.status === "locked" && output?.roleProgress) {
          const restored = new Map<string, RoleAnalysisProgress>();
          for (const r of output.roleProgress) restored.set(r.role_id, r);
          setRoleProgress(restored);
          setStatus("locked");
        }
      } catch (e: any) {
        if (!cancelled) toast.error(`Failed to load Step 4 state: ${e?.message ?? "Unknown error"}`);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const startAnalysis = useCallback(async (input: AnalysisInput) => {
    setError(null);
    setStatus("analyzing");

    // Build initial role progress map
    const initial = new Map<string, RoleAnalysisProgress>();
    for (const role of input.roles) {
      const result = input.roleResults.find((r) => r.role_id === role.id);
      const includedActors = (result?.actors || []).filter((a) => a.triage_decision === "included");
      initial.set(role.id, {
        role_id: role.id,
        role_name: role.name,
        status: "waiting",
        total_actors: includedActors.length,
        completed_actors: 0,
        actors: includedActors.map((a) => ({
          actor_id: a.id,
          actor_name: a.name,
          actor_type: (a as any).actor_type || "commercial",
          status: "waiting",
          source_actor: a,
        })),
      });
    }
    setRoleProgress(new Map(initial));

    let firstExpanded = false;

    const updateRole = (roleId: string, mut: (r: RoleAnalysisProgress) => RoleAnalysisProgress) => {
      setRoleProgress((prev) => {
        const next = new Map(prev);
        const cur = next.get(roleId);
        if (cur) next.set(roleId, mut(cur));
        return next;
      });
    };

    for (const role of input.roles) {
      const progress = initial.get(role.id);
      if (!progress || progress.total_actors === 0) {
        updateRole(role.id, (r) => ({ ...r, status: "complete" }));
        continue;
      }

      setActiveRoleId(role.id);
      updateRole(role.id, (r) => ({ ...r, status: "analyzing" }));
      if (!firstExpanded) {
        setExpandedRoleId(role.id);
        firstExpanded = true;
      }

      const targets = buildTargets(role);

      for (const actorState of progress.actors) {
        const actor = actorState.source_actor;

        // Skip non-commercial: pass through as reference data, no AI call
        if ((actorState.actor_type || "").toLowerCase() !== "commercial") {
          updateRole(role.id, (r) => ({
            ...r,
            completed_actors: r.completed_actors + 1,
            actors: r.actors.map((a) =>
              a.actor_id === actorState.actor_id ? { ...a, status: "skipped" } : a
            ),
          }));
          continue;
        }

        setActiveActorId(actor.id);
        updateRole(role.id, (r) => ({
          ...r,
          actors: r.actors.map((a) =>
            a.actor_id === actorState.actor_id ? { ...a, status: "analyzing" } : a
          ),
        }));

        const payload: CallPayload = {
          actor: {
            id: actor.id,
            name: actor.name,
            website: actor.website,
            description: actor.description,
            actor_type: actorState.actor_type,
            sources: (actor.sources || []).map((s) => ({ url: s.url, title: s.title })),
            evidence_snippets: actor.evidence_snippets || [],
          },
          role: { id: role.id, name: role.name, targets },
          constraints: input.constraints,
        };

        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error("Not authenticated");

          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-actor`,
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
            const eb = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            throw new Error(eb.error || `HTTP ${resp.status}`);
          }

          const data = await resp.json();

          if (data.error || !data.analysis) {
            updateRole(role.id, (r) => ({
              ...r,
              completed_actors: r.completed_actors + 1,
              actors: r.actors.map((a) =>
                a.actor_id === actorState.actor_id
                  ? {
                      ...a,
                      status: "error",
                      error: data.error || "No analysis returned",
                      processing_time_ms: data.processing_time_ms,
                    }
                  : a
              ),
            }));
          } else {
            updateRole(role.id, (r) => ({
              ...r,
              completed_actors: r.completed_actors + 1,
              actors: r.actors.map((a) =>
                a.actor_id === actorState.actor_id
                  ? {
                      ...a,
                      status: "complete",
                      result: data.analysis as ActorAnalysis,
                      processing_time_ms: data.processing_time_ms,
                    }
                  : a
              ),
            }));
          }
        } catch (e: any) {
          updateRole(role.id, (r) => ({
            ...r,
            completed_actors: r.completed_actors + 1,
            actors: r.actors.map((a) =>
              a.actor_id === actorState.actor_id ? { ...a, status: "error", error: e.message } : a
            ),
          }));
        } finally {
          setActiveActorId(null);
        }
      }

      // Mark role complete (or error if every actor errored)
      updateRole(role.id, (r) => {
        const nonSkipped = r.actors.filter((a) => a.status !== "skipped");
        const allError = nonSkipped.length > 0 && nonSkipped.every((a) => a.status === "error");
        return { ...r, status: allError ? "error" : "complete" };
      });
    }

    setActiveRoleId(null);
    setStatus("complete");
  }, []);

  const lock = useCallback(async () => {
    if (sessionId) {
      const now = new Date().toISOString();
      const lockedOutput = { roleProgress: Array.from(roleProgress.values()) };
      const { data: existing, error: selErr } = await supabase
        .from("session_step_states")
        .select("id")
        .eq("session_id", sessionId)
        .eq("step", "A4")
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
          step: "A4",
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
  }, [sessionId, roleProgress]);

  const unlock = useCallback(async () => {
    if (sessionId) {
      const { error } = await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A4");
      if (error) {
        toast.error(`Unlock failed: ${error.message}`);
        return;
      }
    }
    setStatus("complete");
  }, [sessionId]);

  // Full reset — used by upstream cascade
  const reset = useCallback(async () => {
    if (sessionId) {
      const { error } = await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A4");
      if (error) toast.error(`Reset failed: ${error.message}`);
    }
    setStatus("not_started");
    setRoleProgress(new Map());
    setActiveRoleId(null);
    setActiveActorId(null);
    setExpandedRoleId(null);
    setError(null);
  }, [sessionId]);

  const orderedRoles = useMemo(() => Array.from(roleProgress.values()), [roleProgress]);

  const totals = useMemo(() => {
    let analyzed = 0;
    let reference = 0;
    let errors = 0;
    let pending = 0;
    for (const r of roleProgress.values()) {
      for (const a of r.actors) {
        if (a.status === "complete") analyzed++;
        else if (a.status === "skipped") reference++;
        else if (a.status === "error") errors++;
        else pending++;
      }
    }
    return { analyzed, reference, errors, pending };
  }, [roleProgress]);

  const canLock = status === "complete" && totals.pending === 0;

  const buildAnalyzedActors = useCallback((): AnalyzedActors => {
    const actors: AnalyzedActor[] = [];
    for (const r of roleProgress.values()) {
      for (const a of r.actors) {
        actors.push({
          selectionId: a.actor_id,
          actorId: a.actor_id,
          roleId: r.role_id,
          status: a.status === "complete" ? "analyzed" : a.status === "skipped" ? "skipped" : "error",
          analysis: a.result || null,
          note: a.status === "skipped" ? "Reference actor — not analyzed" : a.error,
        });
      }
    }
    return { actors };
  }, [roleProgress]);

  return {
    status,
    orderedRoles,
    activeRoleId,
    activeActorId,
    expandedRoleId,
    error,
    totals,
    canLock,
    setExpandedRoleId,
    startAnalysis,
    lock,
    unlock,
    reset,
    buildAnalyzedActors,
  };
}
