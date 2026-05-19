// C2: shared admin predicate. Mirrors useConsultantAccess shape so a future
// ABAC migration only changes this hook. Today it reduces to users.role='admin'.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useAdminAccess() {
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
        const { data, error } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          toast.error("Failed to verify admin role");
          setHasAccess(false);
        } else {
          setHasAccess(data?.role === "admin");
        }
      } catch (e: any) {
        if (!cancelled) toast.error(`Admin access check failed: ${e?.message ?? "Unknown error"}`);
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
