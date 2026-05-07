// Phase 6.5.5c-b: shared predicate for consultant workspace gating.
// Used by both the route-level guard (ConsultantLayout) and the switcher
// button (SidebarNav) so the two cannot drift.
//
// Predicate: admin OR user_attributes(key='role', value='consultant').
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useConsultantAccess() {
  const { user, loading: authLoading } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setHasAccess(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: profile }, { data: attrs }] = await Promise.all([
        supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
        supabase
          .from("user_attributes")
          .select("key, value, expires_at")
          .eq("user_id", user.id)
          .eq("key", "role")
          .eq("value", "consultant"),
      ]);
      if (cancelled) return;
      const isAdmin = profile?.role === "admin";
      const hasConsultantAttr = (attrs ?? []).some(
        (a) => !a.expires_at || new Date(a.expires_at) > new Date()
      );
      setHasAccess(isAdmin || hasConsultantAttr);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { hasAccess, loading: authLoading || loading };
}
