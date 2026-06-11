// SX-03 — useAxis: per-session, per-step Axis state (questions + pending changes + stale role ids).
// Persists into session_step_states.locked_output under the `axis` JSON key on the matching step row.
// Robust against concurrent writes from useInterpretation.lock by always merging existing locked_output.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  AxisQuestion,
  AxisPendingChange,
  AxisStateByStep,
  AxisStep,
  AxisStepState,
} from "@/types/axis";

const EMPTY_STEP: AxisStepState = { questions: [], pending_changes: [], stale_role_ids: [] };

interface UseAxisProps {
  sessionId: string | null;
}

export function useAxis({ sessionId }: UseAxisProps) {
  const [state, setState] = useState<AxisStateByStep>({});
  const [loadingStep, setLoadingStep] = useState<AxisStep | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stateRef = useRef<AxisStateByStep>({});
  useEffect(() => { stateRef.current = state; }, [state]);

  // Initial load — for each step row, pull axis sub-tree.
  useEffect(() => {
    if (!sessionId) {
      setState({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("session_step_states")
        .select("step, locked_output")
        .eq("session_id", sessionId);
      if (cancelled || !data) return;
      const next: AxisStateByStep = {};
      for (const row of data) {
        const axis = (row.locked_output as any)?.axis;
        if (axis && (row.step === "A1" || row.step === "A2" || row.step === "A3" || row.step === "A4" || row.step === "A5")) {
          next[row.step as AxisStep] = {
            questions: Array.isArray(axis.questions) ? axis.questions : [],
            pending_changes: Array.isArray(axis.pending_changes) ? axis.pending_changes : [],
            stale_role_ids: Array.isArray(axis.stale_role_ids) ? axis.stale_role_ids : [],
          };
        }
      }
      setState(next);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const persistStep = useCallback(async (step: AxisStep, next: AxisStepState) => {
    if (!sessionId) return;
    const { data: existing } = await supabase
      .from("session_step_states")
      .select("id, status, locked_output")
      .eq("session_id", sessionId)
      .eq("step", step)
      .maybeSingle();
    const mergedOutput = { ...((existing?.locked_output as any) || {}), axis: next };
    if (existing) {
      await supabase
        .from("session_step_states")
        .update({ locked_output: mergedOutput as any })
        .eq("id", existing.id);
    } else {
      await supabase.from("session_step_states").insert([{
        session_id: sessionId,
        step,
        status: "editing",
        locked_output: mergedOutput as any,
      }]);
    }
  }, [sessionId]);

  const setStep = useCallback((step: AxisStep, updater: (prev: AxisStepState) => AxisStepState) => {
    setState((prev) => {
      const cur = prev[step] ?? EMPTY_STEP;
      const next = updater(cur);
      const out = { ...prev, [step]: next };
      // Fire-and-forget persistence.
      persistStep(step, next).catch((e) => console.error("axis persist failed:", e));
      return out;
    });
  }, [persistStep]);

  const requestQuestions = useCallback(async (step: AxisStep, stepContext: any) => {
    setLoadingStep(step);
    setErrorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/axis-question`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            session_id: sessionId,
            step,
            step_context: stepContext,
          }),
        },
      );
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        if (resp.status === 429) throw new Error("Axis is rate-limited. Try again shortly.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
        throw new Error(errBody.error || `axis-question HTTP ${resp.status}`);
      }
      const { questions } = (await resp.json()) as { questions: AxisQuestion[] };
      setStep(step, (prev) => ({
        ...prev,
        // Preserve answered questions; replace unanswered set with new questions.
        questions: [
          ...(prev.questions || []).filter((q) => q.answered_at),
          ...questions,
        ],
      }));
    } catch (e: any) {
      console.error("axis requestQuestions failed:", e);
      setErrorMessage(e?.message || "Failed to load Axis questions");
      toast.error(e?.message || "Failed to load Axis questions");
    } finally {
      setLoadingStep(null);
    }
  }, [sessionId, setStep]);

  const resolveAnswer = useCallback(async (
    step: AxisStep,
    question: AxisQuestion,
    answer: string | string[] | boolean,
    stepContext: any,
  ): Promise<AxisPendingChange[]> => {
    setErrorMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/axis-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            session_id: sessionId,
            step,
            question,
            answer,
            step_context: stepContext,
          }),
        },
      );
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        if (resp.status === 429) throw new Error("Axis is rate-limited. Try again shortly.");
        if (resp.status === 402) throw new Error("AI credits exhausted.");
        throw new Error(errBody.error || `axis-resolve HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const changes: AxisPendingChange[] = (data.changes || []).map((c: any) => ({
        id: crypto.randomUUID(),
        step,
        source: "axis" as const,
        status: "pending" as const,
        action: { kind: c.kind, target: c.target, value: c.value, label: c.label },
        label: c.label,
        message: data.message,
        question_id: question.id,
        created_at: new Date().toISOString(),
      }));

      setStep(step, (prev) => ({
        ...prev,
        questions: prev.questions.map((q) =>
          q.id === question.id
            ? { ...q, answer, answered_at: new Date().toISOString(), applied_change_ids: changes.map((c) => c.id) }
            : q
        ),
        pending_changes: [...prev.pending_changes, ...changes],
      }));

      if (changes.length === 0 && data.message) toast(data.message);
      return changes;
    } catch (e: any) {
      console.error("axis resolveAnswer failed:", e);
      setErrorMessage(e?.message || "Failed to resolve answer");
      toast.error(e?.message || "Failed to resolve answer");
      return [];
    }
  }, [sessionId, setStep]);

  /** Mark a pending change as accepted/rejected. Application to interpretation handled by caller. */
  const setChangeStatus = useCallback((step: AxisStep, changeId: string, status: "accepted" | "rejected") => {
    setStep(step, (prev) => ({
      ...prev,
      pending_changes: prev.pending_changes.map((c) =>
        c.id === changeId ? { ...c, status } : c
      ),
    }));
  }, [setStep]);

  const markRoleStale = useCallback((step: AxisStep, roleId: string) => {
    setStep(step, (prev) => ({
      ...prev,
      stale_role_ids: Array.from(new Set([...(prev.stale_role_ids || []), roleId])),
    }));
  }, [setStep]);

  const clearStaleRole = useCallback((step: AxisStep, roleId: string) => {
    setStep(step, (prev) => ({
      ...prev,
      stale_role_ids: (prev.stale_role_ids || []).filter((id) => id !== roleId),
    }));
  }, [setStep]);

  const resetStep = useCallback((step: AxisStep) => {
    setStep(step, () => ({ ...EMPTY_STEP }));
  }, [setStep]);

  return {
    state,
    loadingStep,
    errorMessage,
    requestQuestions,
    resolveAnswer,
    setChangeStatus,
    markRoleStale,
    clearStaleRole,
    resetStep,
  };
}
