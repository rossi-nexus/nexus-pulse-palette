import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shared mutations for personal actors (My Collection).
 * Used by both ActorProfile (full page) and ActorsView (cards).
 *
 * All operations target user_personal_actors and actor_validation_queue.
 * RLS enforces ownership and the "merged actors are immutable" rule —
 * we still keep frontend guards so the UI matches.
 */
export function useActorActions() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const updateNotes = useCallback(
    async (actorId: string, notes: string): Promise<boolean> => {
      setBusy("notes");
      try {
        const { error } = await supabase
          .from("user_personal_actors")
          .update({ notes })
          .eq("id", actorId);
        if (error) throw error;
        toast.success("Notes saved");
        return true;
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to save notes");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const updateTags = useCallback(
    async (actorId: string, tags: string[]): Promise<boolean> => {
      setBusy("tags");
      try {
        const { error } = await supabase
          .from("user_personal_actors")
          .update({ tags })
          .eq("id", actorId);
        if (error) throw error;
        toast.success("Tags saved");
        return true;
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to save tags");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  /**
   * One-way action: marks the personal actor as suggested and creates a
   * pending row in actor_validation_queue for admin review.
   */
  const suggestForDb = useCallback(
    async (actorId: string): Promise<boolean> => {
      if (!user) {
        toast.error("You must be signed in");
        return false;
      }
      setBusy("suggest");
      try {
        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("user_personal_actors")
          .update({
            status: "suggested",
            suggested_at: nowIso,
          })
          .eq("id", actorId);
        if (upErr) throw upErr;

        const { error: qErr } = await supabase
          .from("actor_validation_queue")
          .insert({
            user_personal_actor_id: actorId,
            suggested_by: user.id,
            status: "pending",
          });
        if (qErr) throw qErr;

        toast.success("Suggested for review");
        return true;
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to suggest actor");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [user],
  );

  const deleteFromCollection = useCallback(
    async (actorId: string): Promise<boolean> => {
      setBusy("delete");
      try {
        const { error } = await supabase
          .from("user_personal_actors")
          .delete()
          .eq("id", actorId);
        if (error) throw error;
        toast.success("Deleted from collection");
        return true;
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to delete actor");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return { busy, updateNotes, updateTags, suggestForDb, deleteFromCollection };
}
