// SX-03 / SX-03b — useAxis: per-session, per-step Axis state.
// Persists into session_step_states.locked_output.axis.<step> (nested by step) on the
// matching step row, merge-safe so sibling keys (e.g. interpretation, needDescription)
// are never dropped. Writes are awaited via a chained per-step queue so rapid updates
// preserve order and flush before useful unmount events.

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
  const [initialized, setInitialized] = useState(false);
  const stateRef = useRef<AxisStateByStep>({});
  // Per-step write chain — guarantees ordering and merge-safety against concurrent writes.
  const writeChains = useRef<Record<string, Promise<unknown>>>({});

  useEffect(() => { stateRef.current = state; }, [state]);

  // Initial load (and re-load on session switch). Reads axis.<step> from every row
  // for this session and rehydrates state.
  useEffect(() => {
    setInitialized(false);
    if (!sessionId) {
      setState({});
      setInitialized(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("session_step_states")
        .select("step, locked_output")
        .eq("session_id", sessionId);
      if (cancelled) return;
      if (error) {
        console.error("axis load failed:", error);
        setInitialized(true);
        return;
      }
      const next: AxisStateByStep = {};
      for (const row of data || []) {
        const axisRaw = (row.locked_output as any)?.axis;
        if (!axisRaw) continue;
        // Two supported shapes:
        //  (a) NEW — { axis: { A1: state, A2: state, ... } }
        //  (b) LEGACY — { axis: state }  (pre-SX-03b)
        const isNested =
          typeof axisRaw === "object" &&
          !Array.isArray(axisRaw) &&
          !("questions" in axisRaw);
        if (isNested) {
          for (const stepKey of ["A1", "A2", "A3", "A4", "A5"] as const) {
            const s = axisRaw[stepKey];
            if (s) {
              next[stepKey] = {
                questions: Array.isArray(s.questions) ? s.questions : [],
                pending_changes: Array.isArray(s.pending_changes) ? s.pending_changes : [],
                stale_role_ids: Array.isArray(s.stale_role_ids) ? s.stale_role_ids : [],
              };
            }
          }
        } else if (row.step === "A1" || row.step === "A2" || row.step === "A3" || row.step === "A4" || row.step === "A5") {
          // legacy flat
          next[row.step as AxisStep] = {
            questions: Array.isArray(axisRaw.questions) ? axisRaw.questions : [],
            pending_changes: Array.isArray(axisRaw.pending_changes) ? axisRaw.pending_changes : [],
            stale_role_ids: Array.isArray(axisRaw.stale_role_ids) ? axisRaw.stale_role_ids : [],
          };
        }
      }
      setState(next);
      setInitialized(true);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Write `state` into the matching step row at locked_output.axis.<step>.
  // Reads the latest row, merges with sibling keys, then writes.
  const writeStep = useCallback(async (step: AxisStep, next: AxisStepState) => {
    if (!sessionId) return;
    const { data: existing } = await supabase
      .from("session_step_states")
      .select("id, status, locked_output")
      .eq("session_id", sessionId)
      .eq("step", step)
      .maybeSingle();

    const existingOutput = (existing?.locked_output as any) || {};
    const existingAxis = (existingOutput.axis && typeof existingOutput.axis === "object" && !Array.isArray(existingOutput.axis))
      ? existingOutput.axis
      : {};
    // Migrate legacy flat shape into nested while we're here.
    const isLegacyFlat = "questions" in existingAxis;
    const normalizedAxis = isLegacyFlat ? { [step]: existingAxis } : existingAxis;
    const mergedAxis = { ...normalizedAxis, [step]: next };
    const mergedOutput = { ...existingOutput, axis: mergedAxis };

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

  const persistStep = useCallback((step: AxisStep, next: AxisStepState) => {
    const key = `${sessionId}:${step}`;
    const prev = writeChains.current[key] ?? Promise.resolve();
    const chained = prev
      .catch(() => undefined)
      .then(() => writeStep(step, next))
      .catch((e) => console.error("axis persist failed:", e));
    writeChains.current[key] = chained;
    return chained;
  }, [sessionId, writeStep]);

  const setStep = useCallback((step: AxisStep, updater: (prev: AxisStepState) => AxisStepState) => {
    setState((prev) => {
      const cur = prev[step] ?? EMPTY_STEP;
      const next = updater(cur);
      const out = { ...prev, [step]: next };
      persistStep(step, next);
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
      const rawChanges: any[] = Array.isArray(data.changes) ? data.changes : [];
      let changes: AxisPendingChange[] = rawChanges.map((c: any) => ({
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

      // SX-04c — if there's nothing concrete to apply, still keep an audit-trail
      // entry so the decision card has an effect line ("recorded for interpretation").
      const isConcrete = (c: AxisPendingChange) =>
        c.action.kind !== "noop" && c.action.kind !== "context";
      if (changes.length === 0 || !changes.some(isConcrete)) {
        changes = [{
          id: crypto.randomUUID(),
          step,
          source: "axis" as const,
          status: "recorded" as const,
          action: { kind: "noop" },
          label: data.message || "Recorded for interpretation",
          message: data.message,
          question_id: question.id,
          created_at: new Date().toISOString(),
        }];
      }

      setStep(step, (prev) => ({
        ...prev,
        questions: prev.questions.map((q) =>
          q.id === question.id
            ? { ...q, answer, answered_at: new Date().toISOString(), applied_change_ids: changes.map((c) => c.id) }
            : q
        ),
        pending_changes: [...prev.pending_changes, ...changes],
      }));

      return changes;
    } catch (e: any) {
      console.error("axis resolveAnswer failed:", e);
      setErrorMessage(e?.message || "Failed to resolve answer");
      toast.error(e?.message || "Failed to resolve answer");
      return [];
    }
  }, [sessionId, setStep]);

  /** Mark a tracked change's status. Application to interpretation handled by caller. */
  const setChangeStatus = useCallback((step: AxisStep, changeId: string, status: AxisPendingChange["status"]) => {
    setStep(step, (prev) => ({
      ...prev,
      pending_changes: prev.pending_changes.map((c) =>
        c.id === changeId ? { ...c, status } : c
      ),
    }));
  }, [setStep]);

  /** SX-04c — dismiss an open question without answering it. */
  const dismissQuestion = useCallback((step: AxisStep, questionId: string) => {
    setStep(step, (prev) => {
      const q = prev.questions.find((qq) => qq.id === questionId);
      if (!q || q.answered_at) return prev;
      const dismissedChange: AxisPendingChange = {
        id: crypto.randomUUID(),
        step,
        source: "axis",
        status: "dismissed",
        action: { kind: "noop" },
        label: "Dismissed",
        question_id: questionId,
        created_at: new Date().toISOString(),
      };
      return {
        ...prev,
        questions: prev.questions.map((qq) =>
          qq.id === questionId
            ? { ...qq, answered_at: new Date().toISOString(), applied_change_ids: [dismissedChange.id] }
            : qq,
        ),
        pending_changes: [...prev.pending_changes, dismissedChange],
      };
    });
  }, [setStep]);

  /** SX-04c — reopen a decided question. Existing applied changes stay accepted
   *  until a new answer overrides them (caller handles cascade if needed). */
  const reopenQuestion = useCallback((step: AxisStep, questionId: string) => {
    setStep(step, (prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? { ...q, answered_at: undefined, answer: undefined, applied_change_ids: [] }
          : q,
      ),
      // Drop "dismissed" / "recorded" stub entries — they exist only to represent the prior state.
      pending_changes: prev.pending_changes.filter(
        (c) => !(c.question_id === questionId && (c.status === "dismissed" || c.status === "recorded" || c.status === "pending")),
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
    initialized,
    requestQuestions,
    resolveAnswer,
    setChangeStatus,
    dismissQuestion,
    reopenQuestion,
    markRoleStale,
    clearStaleRole,
    resetStep,
  };
}
