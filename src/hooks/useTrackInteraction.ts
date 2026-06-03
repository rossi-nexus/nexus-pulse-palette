// AX4 — Single helper for inserting user_actor_interactions rows.
// Fire-and-forget: failures log to console, never block the UI.
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type InteractionType =
  | "result_viewed"
  | "profile_opened"
  | "included"
  | "saved_for_later"
  | "compared"
  | "unincluded";

export function useTrackInteraction(sessionId: string | null = null) {
  const { user } = useAuth();

  return useCallback(
    (actorId: string, interactionType: InteractionType, metadata?: Record<string, unknown>) => {
      if (!user) return;
      // db: prefix means we don't have a real verified-actor id yet — skip.
      if (!actorId || actorId.startsWith("local:") || actorId.length < 30) return;
      const realId = actorId.startsWith("db:") ? actorId.slice(3) : actorId;
      (supabase as any)
        .from("user_actor_interactions")
        .insert({
          user_id: user.id,
          actor_id: realId,
          session_id: sessionId,
          interaction_type: interactionType,
          metadata: metadata ?? null,
        })
        .then(({ error }: { error: any }) => {
          if (error) {
            // result_viewed fires a lot — keep noise low
            if (interactionType !== "result_viewed") {
              console.warn(`track ${interactionType} failed:`, error.message);
            }
          }
        });
    },
    [user, sessionId],
  );
}
