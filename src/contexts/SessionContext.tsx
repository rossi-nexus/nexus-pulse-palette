import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SessionListItem {
  id: string;
  name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  programme_id: string | null;
}

/**
 * Effective ABAC attribute set: real attributes from `user_attributes` merged
 * with optional dev-mode URL overrides (`?attr=key:value` or
 * `?attr=key1:value1,key2:value2`). Override is gated by `import.meta.env.DEV`
 * and only affects frontend gating decisions — RLS still uses real DB attrs.
 */
export type EffectiveAttributes = Record<string, string | null>;

interface SessionContextValue {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  sessions: SessionListItem[];
  loading: boolean;
  isAdmin: boolean;
  effectiveAttributes: EffectiveAttributes;
  hasAttr: (key: string, value?: string) => boolean;
  refreshSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  renameSession: (id: string, name: string) => Promise<void>;
  assignSessionToProgramme: (id: string, programmeId: string | null) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function parseAttrOverrides(): EffectiveAttributes {
  if (!import.meta.env.DEV) return {};
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("attr");
  if (!raw) return {};
  const out: EffectiveAttributes = {};
  for (const pair of raw.split(",")) {
    const [k, v] = pair.split(":");
    if (k) out[k.trim()] = v?.trim() ?? null;
  }
  return out;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dbAttributes, setDbAttributes] = useState<EffectiveAttributes>({});

  const attrOverrides = useMemo(() => parseAttrOverrides(), []);

  const effectiveAttributes = useMemo<EffectiveAttributes>(
    () => ({ ...dbAttributes, ...attrOverrides }),
    [dbAttributes, attrOverrides]
  );

  const hasAttr = useCallback(
    (key: string, value?: string) => {
      if (!(key in effectiveAttributes)) return false;
      if (value === undefined) return true;
      return effectiveAttributes[key] === value;
    },
    [effectiveAttributes]
  );

  const fetchSessions = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("search_sessions")
      .select("id, name, status, created_at, updated_at, programme_id")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error(`Failed to load sessions: ${error.message}`);
      return [] as SessionListItem[];
    }
    return (data ?? []) as SessionListItem[];
  }, []);

  // Initial load: pick latest session or create one. Also load user role + attributes.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Load role
        const { data: profile, error: profErr } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr) throw profErr;
        if (!cancelled) setIsAdmin(profile?.role === "admin");

        // Load ABAC attributes
        const { data: attrs, error: attrErr } = await supabase
          .from("user_attributes")
          .select("key, value")
          .eq("user_id", user.id);
        if (attrErr) throw attrErr;
        if (!cancelled) {
          const map: EffectiveAttributes = {};
          for (const row of attrs ?? []) map[row.key] = row.value;
          setDbAttributes(map);
        }

        const list = await fetchSessions(user.id);
        if (cancelled) return;

        if (list.length > 0) {
          setSessions(list);
          setSessionIdState(list[0].id);
        } else {
          const { data: created, error: createErr } = await supabase
            .from("search_sessions")
            .insert({ user_id: user.id, status: "active" })
            .select("id, name, status, created_at, updated_at, programme_id")
            .single();
          if (createErr) {
            toast.error(`Failed to create session: ${createErr.message}`);
          } else if (created && !cancelled) {
            setSessions([created as SessionListItem]);
            setSessionIdState(created.id);
          }
        }
      } catch (e: any) {
        if (!cancelled) toast.error(`Session init failed: ${e?.message ?? "Unknown error"}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, fetchSessions]);

  const refreshSessions = useCallback(async () => {
    if (!user) return;
    const list = await fetchSessions(user.id);
    setSessions(list);
  }, [user, fetchSessions]);

  const setSessionId = useCallback((id: string) => {
    setSessionIdState(id);
  }, []);

  const createSession = useCallback(async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("search_sessions")
      .insert({ user_id: user.id, status: "active" })
      .select("id, name, status, created_at, updated_at, programme_id")
      .single();
    if (error) {
      toast.error(`Failed to create session: ${error.message}`);
      return null;
    }
    if (data) {
      setSessions((prev) => [data as SessionListItem, ...prev]);
      setSessionIdState(data.id);
      return data.id;
    }
    return null;
  }, [user]);

  const renameSession = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from("search_sessions").update({ name }).eq("id", id);
    if (error) {
      toast.error(`Rename failed: ${error.message}`);
      return;
    }
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  const assignSessionToProgramme = useCallback(
    async (id: string, programmeId: string | null) => {
      const { error } = await supabase.from("search_sessions").update({ programme_id: programmeId }).eq("id", id);
      if (error) {
        toast.error(`Failed to assign session: ${error.message}`);
        return;
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, programme_id: programmeId } : s))
      );
    },
    []
  );

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        setSessionId,
        sessions,
        loading,
        isAdmin,
        effectiveAttributes,
        hasAttr,
        refreshSessions,
        createSession,
        renameSession,
        assignSessionToProgramme,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
}
