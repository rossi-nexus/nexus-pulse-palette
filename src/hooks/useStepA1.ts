import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NeedAttachment } from "@/types/need-description";
import type { StepStatus } from "@/types/session";

interface UseStepA1Props {
  sessionId: string | null;
}

interface StepA1State {
  contextText: string;
  attachments: NeedAttachment[];
  status: StepStatus;
  loading: boolean;
  error: string | null;
}

export function useStepA1({ sessionId }: UseStepA1Props) {
  const [state, setState] = useState<StepA1State>({
    contextText: "",
    attachments: [],
    status: "editing",
    loading: true,
    error: null,
  });

  // Load existing step state
  useEffect(() => {
    if (!sessionId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const load = async () => {
      const { data } = await supabase
        .from("session_step_states")
        .select("*")
        .eq("session_id", sessionId)
        .eq("step", "A1")
        .maybeSingle();

      if (data) {
        const output = data.locked_output as Record<string, unknown> | null;
        setState({
          contextText: (output?.context_text as string) || "",
          attachments: (output?.attachments as NeedAttachment[]) || [],
          status: data.status as StepStatus,
          loading: false,
          error: null,
        });
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    };
    load();
  }, [sessionId]);

  const setContextText = useCallback((contextText: string) => {
    setState((s) => ({ ...s, contextText, error: null }));
  }, []);

  const setAttachments = useCallback((attachments: NeedAttachment[]) => {
    setState((s) => ({ ...s, attachments }));
  }, []);

  const addAttachment = useCallback((attachment: NeedAttachment) => {
    setState((s) => ({ ...s, attachments: [...s.attachments, attachment] }));
  }, []);

  const removeAttachment = useCallback(
    async (index: number) => {
      const att = state.attachments[index];
      // If it's a file, also remove from storage
      if (att?.type === "file" && att.storage_path) {
        await supabase.storage
          .from("need-attachments")
          .remove([att.storage_path]);
      }
      setState((s) => ({
        ...s,
        attachments: s.attachments.filter((_, i) => i !== index),
      }));
    },
    [state.attachments]
  );

  const setError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, error }));
  }, []);

  const canLock = state.contextText.trim().length > 0 || state.attachments.length > 0;

  const lock = useCallback(async () => {
    if (!sessionId || !canLock) return;

    const needDescription: Record<string, unknown> = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      attachments: state.attachments,
      locked_at: new Date().toISOString(),
    };

    if (state.contextText.trim()) {
      needDescription.context_text = state.contextText.trim();
    }

    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("session_step_states")
      .select("id")
      .eq("session_id", sessionId)
      .eq("step", "A1")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("session_step_states")
        .update({
          status: "locked" as string,
          locked_output: needDescription as any,
          locked_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("session_step_states").insert([{
        session_id: sessionId,
        step: "A1" as string,
        status: "locked" as string,
        locked_output: needDescription as any,
        locked_at: now,
      }]);
    }

    setState((s) => ({ ...s, status: "locked" }));
  }, [sessionId, state.contextText, state.attachments, canLock]);

  const unlock = useCallback(async () => {
    if (!sessionId) return;

    await supabase
      .from("session_step_states")
      .update({ status: "editing", locked_output: null, locked_at: null })
      .eq("session_id", sessionId)
      .eq("step", "A1");

    setState((s) => ({ ...s, status: "editing" }));
  }, [sessionId]);

  const reset = useCallback(async () => {
    // Step 1 has no upstream — reset clears the row and returns to a fresh editing state
    if (sessionId) {
      await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A1");
    }
    setState({
      contextText: "",
      attachments: [],
      status: "editing",
      loading: false,
      error: null,
    });
  }, [sessionId]);

  return {
    contextText: state.contextText,
    attachments: state.attachments,
    status: state.status,
    loading: state.loading,
    error: state.error,
    canLock,
    setContextText,
    setAttachments,
    addAttachment,
    removeAttachment,
    setError,
    lock,
    unlock,
    reset,
  };
}
