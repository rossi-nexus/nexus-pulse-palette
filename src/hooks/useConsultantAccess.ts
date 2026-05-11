// Phase 6.5.5c-b: shared predicate for consultant workspace gating.
// Used by both the route-level guard (ConsultantLayout) and the switcher
// button (SidebarNav) so the two cannot drift.
//
// Predicate: admin OR user_attributes(key='role', value='consultant').
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
      try {
        const [profileRes, attrsRes] = await Promise.allSettled([
          supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
          supabase
            .from("user_attributes")
            .select("key, value, expires_at")
            .eq("user_id", user.id)
            .eq("key", "role")
            .eq("value", "consultant"),
        ]);
        if (cancelled) return;

        let isAdmin = false;
        if (profileRes.status === "fulfilled" && !(profileRes.value as any).error) {
          isAdmin = (profileRes.value as any).data?.role === "admin";
        } else {
          toast.error("Failed to verify role");
        }

        let hasConsultantAttr = false;
        if (attrsRes.status === "fulfilled" && !(attrsRes.value as any).error) {
          hasConsultantAttr = ((attrsRes.value as any).data ?? []).some(
            (a: any) => !a.expires_at || new Date(a.expires_at) > new Date(),
          );
        } else {
          toast.error("Failed to verify consultant access");
        }

        setHasAccess(isAdmin || hasConsultantAttr);
      } catch (e: any) {
        if (!cancelled) toast.error(`Access check failed: ${e?.message ?? "Unknown error"}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { hasAccess, loading: authLoading || loading };
}
