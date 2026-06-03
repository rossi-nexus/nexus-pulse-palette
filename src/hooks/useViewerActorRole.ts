// V3 Batch B — viewer role derivation for the actor profile header pill.
// Combines users.role + actor ownership + the personal/database source so the
// header can render a soft-cased badge ("Admin", "Consultant", "Owner",
// "Personal", "Reader").
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ViewerActorRoleKind =
  | "admin"
  | "consultant"
  | "owner"
  | "personal"
  | "reader";

export interface ViewerActorRole {
  kind: ViewerActorRoleKind;
  label: string;
  /** Short helper sentence for the tooltip. */
  description: string;
}

interface Args {
  /** True when the current profile is a personal-side (user_personal_actors) row. */
  isPersonalSource: boolean;
  /** verifier_id on the canonical actor row, if any. */
  actorVerifierId?: string | null;
}

const LABEL: Record<ViewerActorRoleKind, ViewerActorRole> = {
  admin: { kind: "admin", label: "Admin", description: "Full edit, audit visible, destructive actions enabled." },
  consultant: { kind: "consultant", label: "Consultant", description: "Edit on assigned actors, audit visible." },
  owner: { kind: "owner", label: "Owner", description: "You verified this actor — edits attributed to you." },
  personal: { kind: "personal", label: "Personal", description: "Editing your own collection entry." },
  reader: { kind: "reader", label: "Reader", description: "Read-only view." },
};

export function useViewerActorRole({ isPersonalSource, actorVerifierId }: Args): {
  role: ViewerActorRole;
  loading: boolean;
} {
  const { user, loading: authLoading } = useAuth();
  const [usersRole, setUsersRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setUsersRole(null);
      setRoleLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setRoleLoading(true);
      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setUsersRole(data?.role ?? null);
        setRoleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  // Derivation order: admin > consultant > owner > personal > reader.
  // Note: "personal" wins over "owner" because if we're literally on a
  // /actors/:personalId view, that surface is fully user-owned regardless of
  // any verifier_id elsewhere.
  let kind: ViewerActorRoleKind = "reader";
  if (usersRole === "admin") kind = "admin";
  else if (usersRole === "consultant") kind = "consultant";
  else if (isPersonalSource) kind = "personal";
  else if (user?.id && actorVerifierId && user.id === actorVerifierId) kind = "owner";

  return { role: LABEL[kind], loading: authLoading || roleLoading };
}
