import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DatabaseCheckResult, ExactMatch, SimilarActor } from "@/types/database-check";
import type { ActorCardData, RoleSearchResult } from "@/hooks/useSearch";
import type { RoleAnalysisProgress } from "@/hooks/useAnalysis";

export type DatabaseCheckStatus =
  | "not_started"
  | "checking"
  | "complete"
  | "saving"
  | "saved"
  | "locked";

export type DatabaseCheckPhase = "idle" | "phase1" | "phase2" | "done";

interface UseDatabaseCheckProps {
  sessionId: string | null;
}

/** Input shape for the edge function — analyzed actor with optional ontology tag names */
export interface AnalyzedActorForCheck {
  id: string;
  name: string;
  website?: string;
  org_number?: string;
  country?: string;
  actor_type: string;
  role_names: string[];
  ontology_tags?: {
    capabilities: string[];
    domains: string[];
    product_types: string[];
    service_types: string[];
  };
}

export interface SavedForLaterForCheck {
  id: string;
  name: string;
  website?: string;
  actor_type: string;
  role_name: string;
}

interface RawActorWithContext {
  card: ActorCardData;
  role_names: string[];
  /** Pulled from the analysis result if available */
  ontology_tags?: AnalyzedActorForCheck["ontology_tags"];
}

/** Build the edge-function payload from upstream Step 3 + Step 4 state. */
export function buildCheckInputs(
  analyzedRoles: RoleAnalysisProgress[],
  searchRoles: RoleSearchResult[],
): { analyzed: AnalyzedActorForCheck[]; saved: SavedForLaterForCheck[] } {
  // Map Step 3 results by role id for cross-referencing
  const searchById = new Map(searchRoles.map((r) => [r.role_id, r]));

  // 1) Build map of analyzed actors with ontology_tags pulled from analysis result
  const analyzedMap = new Map<string, RawActorWithContext>();
  for (const role of analyzedRoles) {
    const search = searchById.get(role.role_id);
    for (const a of role.actors) {
      if (a.status !== "complete" && a.status !== "skipped") continue;
      const card =
        a.source_actor ||
        (search?.actors.find((sa) => sa.id === a.actor_id) as ActorCardData | undefined);
      if (!card) continue;

      const existing = analyzedMap.get(a.actor_id);
      if (existing) {
        if (!existing.role_names.includes(role.role_name)) {
          existing.role_names.push(role.role_name);
        }
      } else {
        const tags: AnalyzedActorForCheck["ontology_tags"] = {
          capabilities: [],
          domains: [],
          product_types: [],
          service_types: [],
        };
        if (a.result) {
          for (const c of a.result.capabilities || []) {
            for (const e of c.entries || []) tags.capabilities.push(e.entryName);
          }
          for (const d of a.result.domains || []) tags.domains.push(d.domainName);
          for (const p of a.result.products || []) tags.product_types.push(p.productName);
          for (const s of a.result.services || []) tags.service_types.push(s.serviceName);
        }
        analyzedMap.set(a.actor_id, {
          card,
          role_names: [role.role_name],
          ontology_tags: tags,
        });
      }
    }
  }

  const analyzed: AnalyzedActorForCheck[] = Array.from(analyzedMap.values()).map(({ card, role_names, ontology_tags }) => ({
    id: card.id,
    name: card.name,
    website: card.website,
    country: card.country,
    actor_type: card.actor_type,
    role_names,
    ontology_tags,
  }));

  // 2) Saved-for-later (Step 3 actors with triage_decision === "saved_for_later")
  const saved: SavedForLaterForCheck[] = [];
  for (const role of searchRoles) {
    for (const a of role.actors || []) {
      if (a.triage_decision === "saved_for_later") {
        saved.push({
          id: a.id,
          name: a.name,
          website: a.website,
          actor_type: a.actor_type,
          role_name: role.role_name,
        });
      }
    }
  }

  return { analyzed, saved };
}

export function useDatabaseCheck({ sessionId }: UseDatabaseCheckProps) {
  const [status, setStatus] = useState<DatabaseCheckStatus>("not_started");
  const [phase, setPhase] = useState<DatabaseCheckPhase>("idle");
  const [result, setResult] = useState<DatabaseCheckResult | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Restore from session_step_states on init ─────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("session_step_states")
        .select("*")
        .eq("session_id", sessionId)
        .eq("step", "A5")
        .maybeSingle();
      if (cancelled || !data) return;
      const out = data.locked_output as
        | { result?: DatabaseCheckResult; savedCount?: number }
        | null;
      if (data.status === "locked" && out?.result) {
        setResult(out.result);
        setSavedCount(out.savedCount || 0);
        setPhase("done");
        setStatus("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── runCheck: call the check-database edge function ──────────────────
  const runCheck = useCallback(
    async (analyzed: AnalyzedActorForCheck[], saved: SavedForLaterForCheck[]) => {
      if (!sessionId) {
        setError("No session id");
        return;
      }
      setError(null);
      setStatus("checking");
      setPhase("phase1");
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-database`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              analyzed_actors: analyzed,
              saved_for_later: saved,
              session_id: sessionId,
            }),
          },
        );

        if (!resp.ok) {
          const eb = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
          throw new Error(eb.error || `HTTP ${resp.status}`);
        }

        // Brief UX feedback for phase 2
        setPhase("phase2");
        const data = await resp.json();

        const dbResult: DatabaseCheckResult = {
          phase1_matches: (data.phase1?.matches || []) as ExactMatch[],
          phase1_not_in_db: (data.phase1?.not_in_database || []) as string[],
          phase2_suggestions: (data.phase2?.suggestions || []) as SimilarActor[],
          summary: data.summary || {
            total_checked: 0,
            exact_matches: 0,
            not_in_database: 0,
            similar_found: 0,
          },
        };
        setResult(dbResult);
        setPhase("done");
        setStatus("complete");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("not_started");
        setPhase("idle");
      }
    },
    [sessionId],
  );

  // ── saveToPersonalSpace: insert into user_personal_actors ────────────
  const saveToPersonalSpace = useCallback(
    async (
      analyzedRoles: RoleAnalysisProgress[],
      searchRoles: RoleSearchResult[],
    ) => {
      if (!sessionId) return;
      setError(null);
      setStatus("saving");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { analyzed, saved } = buildCheckInputs(analyzedRoles, searchRoles);

        // Build per-actor analysis snapshot map (used for analysis_data column)
        const analysisById = new Map<string, unknown>();
        for (const role of analyzedRoles) {
          for (const a of role.actors) {
            if (a.result) analysisById.set(a.actor_id, a.result);
          }
        }
        // Match info from the current result (if checked)
        const matchInfoById = new Map<string, ExactMatch>();
        for (const m of result?.phase1_matches || []) {
          matchInfoById.set(m.session_actor_id, m);
        }
        // Source actor cards for source_urls + search_data
        const cardById = new Map<string, ActorCardData>();
        for (const role of analyzedRoles) {
          for (const a of role.actors) {
            if (a.source_actor) cardById.set(a.actor_id, a.source_actor);
          }
        }
        for (const role of searchRoles) {
          for (const a of role.actors || []) {
            if (!cardById.has(a.id)) cardById.set(a.id, a);
          }
        }

        const rows: Record<string, unknown>[] = [];

        // Analyzed actors → personal space (source_step: 'analysis', completeness 70)
        for (const a of analyzed) {
          const card = cardById.get(a.id);
          const match = matchInfoById.get(a.id);
          const sources = (card?.sources || []).map((s) => s.url).filter(Boolean);
          rows.push({
            user_id: user.id,
            actor_name: a.name,
            actor_website: a.website || null,
            actor_description: card?.description || null,
            actor_type: a.actor_type || "commercial",
            country: a.country || card?.country || null,
            source_session_id: sessionId,
            source_step: "analysis",
            profile_completeness: 70,
            search_data: card
              ? {
                  match_strength: card.match_strength,
                  evidence_snippets: card.evidence_snippets,
                  sources: card.sources,
                  classification_found: card.classification_found,
                  standards_found: card.standards_found,
                }
              : {},
            analysis_data: analysisById.get(a.id) || {},
            role_names: a.role_names,
            source_urls: sources,
            matched_main_db_actor_id: match?.db_actor_id || null,
            match_timestamp: match ? new Date().toISOString() : null,
            status: "personal",
          });
        }

        // Saved-for-later → personal space (source_step: 'search', completeness 20)
        for (const s of saved) {
          const card = cardById.get(s.id);
          const sources = (card?.sources || []).map((c) => c.url).filter(Boolean);
          rows.push({
            user_id: user.id,
            actor_name: s.name,
            actor_website: s.website || null,
            actor_description: card?.description || null,
            actor_type: s.actor_type || "commercial",
            country: card?.country || null,
            source_session_id: sessionId,
            source_step: "search",
            profile_completeness: 20,
            search_data: card
              ? {
                  match_strength: card.match_strength,
                  evidence_snippets: card.evidence_snippets,
                  sources: card.sources,
                }
              : {},
            analysis_data: {},
            role_names: [s.role_name],
            source_urls: sources,
            status: "personal",
          });
        }

        // Dedupe-on-insert: check existing rows for this session by actor_name
        if (rows.length > 0) {
          const names = rows.map((r) => r.actor_name as string);
          const { data: existing } = await supabase
            .from("user_personal_actors")
            .select("id, actor_name")
            .eq("user_id", user.id)
            .eq("source_session_id", sessionId)
            .in("actor_name", names);
          const existingByName = new Map(
            (existing || []).map((e: any) => [e.actor_name as string, e.id as string]),
          );

          const toInsert: Record<string, unknown>[] = [];
          const updates: { id: string; row: Record<string, unknown> }[] = [];
          for (const row of rows) {
            const existingId = existingByName.get(row.actor_name as string);
            if (existingId) updates.push({ id: existingId, row });
            else toInsert.push(row);
          }

          if (toInsert.length > 0) {
            const { error: insErr } = await supabase
              .from("user_personal_actors")
              .insert(toInsert as any);
            if (insErr) throw insErr;
          }
          for (const u of updates) {
            const { error: upErr } = await supabase
              .from("user_personal_actors")
              .update(u.row as any)
              .eq("id", u.id);
            if (upErr) throw upErr;
          }
        }

        setSavedCount(rows.length);
        setStatus("saved");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("complete");
      }
    },
    [sessionId, result],
  );

  // ── lock / unlock / reset (mirror Steps 1-4) ─────────────────────────
  const lock = useCallback(async () => {
    if (!sessionId) return;
    const now = new Date().toISOString();
    const lockedOutput = { result, savedCount };
    const { data: existing } = await supabase
      .from("session_step_states")
      .select("id")
      .eq("session_id", sessionId)
      .eq("step", "A5")
      .maybeSingle();
    if (existing) {
      await supabase
        .from("session_step_states")
        .update({ status: "locked", locked_output: lockedOutput as any, locked_at: now })
        .eq("id", existing.id);
    } else {
      await supabase.from("session_step_states").insert([
        {
          session_id: sessionId,
          step: "A5",
          status: "locked",
          locked_output: lockedOutput as any,
          locked_at: now,
        },
      ]);
    }
    setStatus("locked");
  }, [sessionId, result, savedCount]);

  const unlock = useCallback(async () => {
    if (!sessionId) return;
    await supabase
      .from("session_step_states")
      .update({ status: "editing", locked_output: null, locked_at: null })
      .eq("session_id", sessionId)
      .eq("step", "A5");
    // Return to "complete" if we had a result, otherwise "saved" if we had saved, else not_started
    setStatus(result ? "complete" : "not_started");
  }, [sessionId, result]);

  const reset = useCallback(async () => {
    if (sessionId) {
      await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A5");
    }
    setStatus("not_started");
    setPhase("idle");
    setResult(null);
    setSavedCount(0);
    setError(null);
  }, [sessionId]);

  const canLock = status === "saved" || status === "complete";
  const totalMatches = result?.summary?.exact_matches ?? 0;
  const totalSuggestions = result?.summary?.similar_found ?? 0;

  return {
    status,
    phase,
    result,
    savedCount,
    error,
    runCheck,
    saveToPersonalSpace,
    lock,
    unlock,
    reset,
    canLock,
    totalMatches,
    totalSuggestions,
  };
}
