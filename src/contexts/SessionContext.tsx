import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SessionListItem {
  id: string;
  name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SessionContextValue {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  sessions: SessionListItem[];
  loading: boolean;
  isAdmin: boolean;
  refreshSessions: () => Promise<void>;
  createSession: () => Promise<string | null>;
  renameSession: (id: string, name: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchSessions = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("search_sessions")
      .select("id, name, status, created_at, updated_at")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("updated_at", { ascending: false });
    return (data ?? []) as SessionListItem[];
  }, []);

  // Initial load: pick latest session or create one. Also load user role.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      // Load role
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setIsAdmin(profile?.role === "admin");

      const list = await fetchSessions(user.id);
      if (cancelled) return;

      if (list.length > 0) {
        setSessions(list);
        setSessionIdState(list[0].id);
      } else {
        const { data: created } = await supabase
          .from("search_sessions")
          .insert({ user_id: user.id, status: "active" })
          .select("id, name, status, created_at, updated_at")
          .single();
        if (created && !cancelled) {
          setSessions([created as SessionListItem]);
          setSessionIdState(created.id);
        }
      }
      if (!cancelled) setLoading(false);
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
    const { data } = await supabase
      .from("search_sessions")
      .insert({ user_id: user.id, status: "active" })
      .select("id, name, status, created_at, updated_at")
      .single();
    if (data) {
      setSessions((prev) => [data as SessionListItem, ...prev]);
      setSessionIdState(data.id);
      return data.id;
    }
    return null;
  }, [user]);

  const renameSession = useCallback(async (id: string, name: string) => {
    await supabase.from("search_sessions").update({ name }).eq("id", id);
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }, []);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        setSessionId,
        sessions,
        loading,
        isAdmin,
        refreshSessions,
        createSession,
        renameSession,
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
