import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NeedDescription } from "@/types/need-description";
import type { StepStatus } from "@/types/session";

interface UseStepA1Props {
  sessionId: string | null;
}

interface StepA1State {
  text: string;
  sourceType: "freeform" | "file" | "url";
  sourceReference?: string;
  status: StepStatus;
  loading: boolean;
  error: string | null;
}

export function useStepA1({ sessionId }: UseStepA1Props) {
  const [state, setState] = useState<StepA1State>({
    text: "",
    sourceType: "freeform",
    sourceReference: undefined,
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
          text: (output?.text as string) || "",
          sourceType: (output?.source_type as "freeform" | "file" | "url") || "freeform",
          sourceReference: (output?.source_reference as string) || undefined,
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

  const setText = useCallback((text: string) => {
    setState((s) => ({ ...s, text, error: null }));
  }, []);

  const setSource = useCallback((sourceType: "freeform" | "file" | "url", sourceReference?: string) => {
    setState((s) => ({ ...s, sourceType, sourceReference }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, error }));
  }, []);

  const lock = useCallback(async () => {
    if (!sessionId || !state.text.trim()) return;

    const needDescription: Record<string, unknown> = {
      text: state.text.trim(),
      source_type: state.sourceType,
      source_reference: state.sourceReference || null,
      locked_at: new Date().toISOString(),
    };

    // Upsert the step state
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
          status: "locked",
          locked_output: needDescription,
          locked_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("session_step_states").insert({
        session_id: sessionId,
        step: "A1",
        status: "locked",
        locked_output: needDescription,
        locked_at: new Date().toISOString(),
      });
    }

    setState((s) => ({ ...s, status: "locked" }));
  }, [sessionId, state.text, state.sourceType, state.sourceReference]);

  const unlock = useCallback(async () => {
    if (!sessionId) return;

    await supabase
      .from("session_step_states")
      .update({ status: "editing", locked_output: null, locked_at: null })
      .eq("session_id", sessionId)
      .eq("step", "A1");

    setState((s) => ({ ...s, status: "editing" }));
  }, [sessionId]);

  return {
    ...state,
    setText,
    setSource,
    setError,
    lock,
    unlock,
  };
}
