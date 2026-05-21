// A4 Area 7 — explicit programme membership gate.
// Mirrors useAdminAccess / useConsultantAccess shape so the three hooks share
// one mental model. RLS is still the source of truth — this hook only drives
// the frontend empty-state for non-members hitting a programme URL directly.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export type ProgrammeRole = "owner" | "member" | null;

export interface UseProgrammeAccessResult {
  hasAccess: boolean;
  role: ProgrammeRole;
  loading: boolean;
}

export function useProgrammeAccess(programmeId: string | undefined): UseProgrammeAccessResult {
  const { user, loading: authLoading } = useAuth();
  const { hasAccess: isAdmin, loading: adminLoading } = useAdminAccess();
  const [hasAccess, setHasAccess] = useState(false);
  const [role, setRole] = useState<ProgrammeRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!programmeId || !user) {
      setHasAccess(isAdmin && !!programmeId);
      setRole(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [memberRes, ownerRes] = await Promise.allSettled([
          (supabase.rpc as any)("fn_user_is_programme_member", {
            _uid: user.id,
            _programme_id: programmeId,
          }),
          (supabase.rpc as any)("fn_user_is_programme_owner", {
            _uid: user.id,
            _programme_id: programmeId,
          }),
        ]);
        if (cancelled) return;

        const isOwner =
          ownerRes.status === "fulfilled" &&
          !(ownerRes.value as any).error &&
          (ownerRes.value as any).data === true;
        const isMember =
          memberRes.status === "fulfilled" &&
          !(memberRes.value as any).error &&
          (memberRes.value as any).data === true;

        const nextRole: ProgrammeRole = isOwner ? "owner" : isMember ? "member" : null;
        setRole(nextRole);
        setHasAccess(isAdmin || isOwner || isMember);
      } catch (e: any) {
        if (!cancelled) toast.error(`Programme access check failed: ${e?.message ?? "Unknown error"}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programmeId, user, authLoading, isAdmin, adminLoading]);

  return { hasAccess, role, loading: authLoading || adminLoading || loading };
}
