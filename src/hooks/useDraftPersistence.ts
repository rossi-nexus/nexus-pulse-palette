// Profile-8: server-side draft persistence for SharedVerificationBody.
// Auto-saves draft_payload every ~5s, restores on mount, exposes discard.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DraftTargetType = "queue" | "actor" | "fresh_onboarding";

export interface DraftTarget {
  targetType: DraftTargetType;
  targetId?: string | null;
  clientSessionId?: string | null;
}

export interface DraftRecord<T = unknown> {
  id: string;
  payload: T;
  updatedAt: string;
}

interface Options<T> {
  target: DraftTarget;
  payload: T;
  /** Disable autosave (e.g. during initial hydration). */
  enabled?: boolean;
  /** Predicate to skip save when payload is effectively empty. */
  hasContent?: (payload: T) => boolean;
  debounceMs?: number;
}

export interface DraftHandle<T> {
  existingDraft: DraftRecord<T> | null;
  loading: boolean;
  pendingSave: boolean;
  discardDraft: () => Promise<void>;
  reloadDraft: () => Promise<DraftRecord<T> | null>;
}

const TABLE = "consultant_drafts" as const;

function buildMatch(userId: string, target: DraftTarget) {
  const base: Record<string, string> = {
    user_id: userId,
    target_type: target.targetType,
  };
  if (target.targetType === "fresh_onboarding") {
    base.client_session_id = target.clientSessionId ?? "";
  } else {
    base.target_id = target.targetId ?? "";
  }
  return base;
}

export function useDraftPersistence<T>({
  target,
  payload,
  enabled = true,
  hasContent,
  debounceMs = 5000,
}: Options<T>): DraftHandle<T> {
  const { user } = useAuth();
  const [existingDraft, setExistingDraft] = useState<DraftRecord<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSave, setPendingSave] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const lastSerializedRef = useRef<string | null>(null);

  const reloadDraft = useCallback(async () => {
    if (!user) return null;
    const match = buildMatch(user.id, target);
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, draft_payload, updated_at")
      .match(match)
      .maybeSingle();
    if (error) {
      console.error("[draft] load failed", error);
      return null;
    }
    if (!data) return null;
    draftIdRef.current = (data as any).id;
    const rec: DraftRecord<T> = {
      id: (data as any).id,
      payload: (data as any).draft_payload as T,
      updatedAt: (data as any).updated_at as string,
    };
    return rec;
  }, [
    user,
    target.targetType,
    target.targetId,
    target.clientSessionId,
  ]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reloadDraft().then((rec) => {
      if (cancelled) return;
      setExistingDraft(rec);
      // Seed serialized cache so the first user-driven change triggers save.
      lastSerializedRef.current = rec ? JSON.stringify(rec.payload) : JSON.stringify(payload);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadDraft]);

  // Debounced auto-save
  useEffect(() => {
    if (!enabled || loading || !user) return;
    const serialized = JSON.stringify(payload);
    if (serialized === lastSerializedRef.current) return;
    if (hasContent && !hasContent(payload)) return;

    setPendingSave(true);
    const t = setTimeout(async () => {
      try {
        const row: Record<string, unknown> = {
          user_id: user.id,
          target_type: target.targetType,
          target_id:
            target.targetType === "fresh_onboarding" ? null : target.targetId ?? null,
          client_session_id:
            target.targetType === "fresh_onboarding"
              ? target.clientSessionId ?? null
              : null,
          draft_payload: payload as unknown as object,
        };
        if (draftIdRef.current) {
          const { error } = await supabase
            .from(TABLE)
            .update({ draft_payload: payload as any })
            .eq("id", draftIdRef.current);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from(TABLE)
            .insert(row as any)
            .select("id")
            .single();
          if (error) throw error;
          draftIdRef.current = (data as any).id;
        }
        lastSerializedRef.current = serialized;
      } catch (e) {
        console.error("[draft] save failed", e);
      } finally {
        setPendingSave(false);
      }
    }, debounceMs);
    return () => {
      clearTimeout(t);
      setPendingSave(false);
    };
  }, [
    payload,
    enabled,
    loading,
    user,
    target.targetType,
    target.targetId,
    target.clientSessionId,
    hasContent,
    debounceMs,
  ]);

  const discardDraft = useCallback(async () => {
    if (!draftIdRef.current) {
      setExistingDraft(null);
      return;
    }
    const { error } = await supabase.from(TABLE).delete().eq("id", draftIdRef.current);
    if (error) {
      console.error("[draft] discard failed", error);
      return;
    }
    draftIdRef.current = null;
    lastSerializedRef.current = JSON.stringify(payload);
    setExistingDraft(null);
  }, [payload]);

  return { existingDraft, loading, pendingSave, discardDraft, reloadDraft };
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
