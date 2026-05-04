// Phase 6.5.5b: lists pending suggestion-queue rows scoped to the consultant's
// accessible programmes (or all rows if admin). Returns the data shape needed
// by the verification workspace UI.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSessionContext } from "@/contexts/SessionContext";

export interface PendingSuggestion {
  queue_id: string;
  personal_actor_id: string;
  actor_name: string;
  actor_description: string | null;
  actor_website: string | null;
  actor_type: string | null;
  country: string | null;
  org_number: string | null;
  trade_names: string[];
  street_address: string | null;
  city: string | null;
  region: string | null;
  matched_main_db_actor_id: string | null;
  suggested_by: string;
  suggested_by_name: string | null;
  suggested_by_email: string | null;
  suggested_at: string | null;
  programme_id: string | null;
  programme_name: string | null;
  source_session_id: string | null;
}

interface QueueRow {
  id: string;
  user_personal_actor_id: string;
  suggested_by: string;
  created_at: string;
  user_personal_actors: {
    id: string;
    actor_name: string;
    actor_description: string | null;
    actor_website: string | null;
    actor_type: string | null;
    country: string | null;
    org_number: string | null;
    trade_names: string[] | null;
    street_address: string | null;
    city: string | null;
    region: string | null;
    matched_main_db_actor_id: string | null;
    suggested_at: string | null;
    source_session_id: string | null;
  } | null;
}

export function useVerificationQueue() {
  const { user } = useAuth();
  const { isAdmin } = useSessionContext();
  const [items, setItems] = useState<PendingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Pull all pending queue rows joined with the personal-actor data.
    const { data: rows } = await supabase
      .from("actor_validation_queue")
      .select(
        `id, user_personal_actor_id, suggested_by, created_at,
         user_personal_actors:user_personal_actor_id (
           id, actor_name, actor_description, actor_website, actor_type,
           country, org_number, trade_names, street_address, city, region,
           matched_main_db_actor_id, suggested_at, source_session_id
         )`,
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const queueRows = (rows ?? []) as unknown as QueueRow[];
    if (queueRows.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Resolve session → programme mapping.
    const sessionIds = Array.from(
      new Set(
        queueRows
          .map((r) => r.user_personal_actors?.source_session_id)
          .filter((x): x is string => !!x),
      ),
    );
    const sessionToProgramme = new Map<string, string | null>();
    if (sessionIds.length > 0) {
      const { data: sessRows } = await supabase
        .from("search_sessions")
        .select("id, programme_id")
        .in("id", sessionIds);
      for (const s of sessRows ?? []) {
        sessionToProgramme.set(s.id, s.programme_id);
      }
    }

    // Resolve programme names + my managed-programme membership.
    const programmeIds = Array.from(
      new Set(
        Array.from(sessionToProgramme.values()).filter(
          (x): x is string => !!x,
        ),
      ),
    );
    const programmeNames = new Map<string, string>();
    const myManagedProgrammeIds = new Set<string>();
    if (programmeIds.length > 0) {
      const { data: progs } = await supabase
        .from("programmes")
        .select("id, name")
        .in("id", programmeIds);
      for (const p of progs ?? []) programmeNames.set(p.id, p.name);

      const { data: myMembership } = await supabase
        .from("programme_members")
        .select("programme_id, role")
        .eq("user_id", user.id)
        .in("programme_id", programmeIds)
        .in("role", ["owner", "consultant"]);
      for (const m of myMembership ?? []) myManagedProgrammeIds.add(m.programme_id);
    }

    // Resolve suggester user info.
    const suggesterIds = Array.from(new Set(queueRows.map((r) => r.suggested_by)));
    const suggesterMap = new Map<string, { name: string | null; email: string | null }>();
    if (suggesterIds.length > 0) {
      const { data: u } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", suggesterIds);
      for (const usr of u ?? []) suggesterMap.set(usr.id, { name: usr.name, email: usr.email });
    }

    const result: PendingSuggestion[] = [];
    for (const r of queueRows) {
      const pa = r.user_personal_actors;
      if (!pa) continue;
      const sessionId = pa.source_session_id;
      const programmeId = sessionId ? sessionToProgramme.get(sessionId) ?? null : null;

      // Scope: admin sees everything; otherwise must be programme manager.
      // Unscoped suggestions (programme_id IS NULL) are admin-only.
      if (!isAdmin) {
        if (!programmeId || !myManagedProgrammeIds.has(programmeId)) continue;
      }

      const suggester = suggesterMap.get(r.suggested_by);
      result.push({
        queue_id: r.id,
        personal_actor_id: pa.id,
        actor_name: pa.actor_name,
        actor_description: pa.actor_description,
        actor_website: pa.actor_website,
        actor_type: pa.actor_type,
        country: pa.country,
        org_number: pa.org_number,
        trade_names: pa.trade_names ?? [],
        street_address: pa.street_address,
        city: pa.city,
        region: pa.region,
        matched_main_db_actor_id: pa.matched_main_db_actor_id,
        suggested_by: r.suggested_by,
        suggested_by_name: suggester?.name ?? null,
        suggested_by_email: suggester?.email ?? null,
        suggested_at: pa.suggested_at,
        programme_id: programmeId,
        programme_name: programmeId ? programmeNames.get(programmeId) ?? null : null,
        source_session_id: sessionId,
      });
    }

    setItems(result);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, refresh: load };
}
