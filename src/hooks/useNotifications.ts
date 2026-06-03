import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const IN_SCOPE_EVENT_TYPES = [
  "approve_and_verify",
  "verify",
  "reject_suggestion",
  "onboard_verified_actor",
  "record_outcome",
  "saved_search_hit",
] as const;

const POLL_INTERVAL_MS = 60_000;
const LOOKBACK_DAYS = 30;
const FEED_LIMIT = 50;
const EPOCH = "1970-01-01T00:00:00Z";

export type NotificationEntry =
  | {
      kind: "audit";
      id: string;
      event_type: string;
      created_at: string;
      actor_id?: string | null;
      programme_id?: string | null;
      changes: Record<string, unknown> | null;
      reason?: string | null;
    }
  | {
      kind: "decay";
      id: string;
      actor_id: string;
      legal_name: string;
      decays_at: string;
      state: "expired" | "decay_warning";
      created_at: string;
    };

export interface UseNotificationsResult {
  entries: NotificationEntry[];
  unreadCount: number;
  lastSeenAt: string;
  loading: boolean;
  error: Error | null;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string>(EPOCH);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLastSeenAt(EPOCH);
      setLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    try {
      const stateP = supabase
        .from("user_notification_state")
        .select("last_seen_at")
        .eq("user_id", userId)
        .maybeSingle();

      const lookback = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const auditP = supabase
        .from("audit_log")
        .select("id, event_type, target_table, target_record_id, actor_id, programme_id, changes, reason, created_at")
        .in("event_type", IN_SCOPE_EVENT_TYPES as unknown as string[])
        .gte("created_at", lookback)
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);

      const decayP = supabase.rpc("fn_notifications_decay_for_me" as any);

      const [stateRes, auditRes, decayRes] = await Promise.all([stateP, auditP, decayP]);
      if (reqId !== reqIdRef.current) return;

      if (auditRes.error) throw auditRes.error;
      if (decayRes.error) throw decayRes.error;

      const seen = stateRes.data?.last_seen_at ?? EPOCH;

      const auditEntries: NotificationEntry[] = (auditRes.data ?? []).map((r: any) => ({
        kind: "audit",
        id: r.id,
        event_type: r.event_type,
        created_at: r.created_at,
        actor_id: r.actor_id,
        programme_id: r.programme_id,
        changes: r.changes,
        reason: r.reason,
      }));

      const decayEntries: NotificationEntry[] = (Array.isArray(decayRes.data) ? decayRes.data : []).map(
        (r: any) => ({
          kind: "decay",
          id: `decay-${r.actor_id}`,
          actor_id: r.actor_id,
          legal_name: r.legal_name,
          decays_at: r.decays_at,
          state: r.state,
          created_at: r.decays_at,
        }),
      );

      const combined = [...auditEntries, ...decayEntries].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );

      setLastSeenAt(seen);
      setEntries(combined);
      setError(null);
    } catch (e: any) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e?.message ?? e)));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
    if (!userId) return;
    const interval = setInterval(load, POLL_INTERVAL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("user_notification_state")
      .upsert({ user_id: userId, last_seen_at: now, updated_at: now }, { onConflict: "user_id" });
    if (upErr) {
      setError(new Error(upErr.message ?? String(upErr)));
      return;
    }
    setLastSeenAt(now);
  }, [userId]);

  const unreadCount = entries.reduce((n, e) => {
    const ts = e.kind === "audit" ? e.created_at : e.decays_at;
    return ts > lastSeenAt ? n + 1 : n;
  }, 0);

  return { entries, unreadCount, lastSeenAt, loading, error, markAllRead, refresh: load };
}
