import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Manages session lifecycle. Creates or loads a session for the current user.
 * For now, auto-creates a session on first visit.
 */
export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Look for an active session
      const { data: sessions } = await supabase
        .from("search_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        setSessionId(sessions[0].id);
      } else {
        // Create a new session
        const { data: newSession } = await supabase
          .from("search_sessions")
          .insert({ user_id: user.id, status: "active" })
          .select("id")
          .single();
        if (newSession) {
          setSessionId(newSession.id);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  return { sessionId, userId, loading };
}
