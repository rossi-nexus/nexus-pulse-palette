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
  /**
   * Verification lifecycle pulled from a matched DB actor. Will be populated
   * once pipeline matching against verified records ships (6.5.5b). Today
   * always undefined, so VerifiedStatusBadge in ActorCard never renders —
   * surface is wired so 6.5.5b only needs to fill the data.
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
  search_mode: "web" | "ai_only";
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
      setActiveRoleId(role.id);
      setRoleResults(prev => {
        const next = new Map(prev);
        const existing = next.get(role.id)!;
        next.set(role.id, { ...existing, status: "searching" });
        return next;
      });

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        // Build selected targets with names
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
          session_id: "current",
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

        const actors: ActorCardData[] = (data.actors || []).map((a: any) => ({
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
        }));

        setRoleResults(prev => {
          const next = new Map(prev);
          next.set(role.id, {
            role_id: role.id,
            role_name: role.name,
            status: data.error ? "error" : "complete",
            actors,
            queries_used: data.queries_used || [],
            search_mode: data.search_mode || "web",
            processing_time_ms: data.processing_time_ms,
            error: data.error,
          });
          return next;
        });

        if (!firstCompleted && !data.error) {
          setExpandedRoleId(role.id);
          firstCompleted = true;
        }
      } catch (err: any) {
        setRoleResults(prev => {
          const next = new Map(prev);
          const existing = next.get(role.id)!;
          next.set(role.id, { ...existing, status: "error", error: err.message });
          return next;
        });
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
