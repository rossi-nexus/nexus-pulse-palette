// SX-04c — Axis sidebar: one-click apply, question dismiss, clean decided cards.
//
// Behaviour:
//  - Choice/boolean questions auto-apply on click (handled in PipelineView).
//  - Free-text questions show an "Axis understood: …" preview inside the same
//    card with Apply / Edit answer. There is no separate Pending Changes pile.
//  - Every open question card has a quiet "Not relevant" dismiss affordance.
//  - Decided cards (answered, dismissed, recorded) render the question text ONCE
//    plus a single effect line. They include a Reopen affordance; accepted
//    changes also expose Revert.

import { useEffect, useMemo, useState } from "react";
import { Bot, Send, Sparkles, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AxisQuestion,
  AxisStep,
  AxisStateByStep,
  AxisStepState,
  AxisPendingChange,
} from "@/types/axis";

interface AxisSidebarProps {
  currentStep: AxisStep | null;
  stepContext: any;
  stateByStep: AxisStateByStep;
  loadingStep: AxisStep | null;
  onRequestQuestions: (step: AxisStep) => void;
  onAnswer: (step: AxisStep, question: AxisQuestion, answer: string | string[] | boolean) => Promise<AxisPendingChange[]>;
  onDismiss: (step: AxisStep, questionId: string) => void;
  onReopen: (step: AxisStep, question: AxisQuestion) => void;
  onApplyPending: (change: AxisPendingChange) => void;
  onRevertChange: (change: AxisPendingChange) => void;
  onFreeChat: (text: string) => Promise<AxisPendingChange[]>;
}

const STEP_LABELS: Record<AxisStep, string> = {
  A1: "Step 1 — Need",
  A2: "Step 2 — Interpretation",
  A3: "Step 3 — Search",
  A4: "Step 4 — Analysis",
  A5: "Step 5 — Database",
};
const STEPS: AxisStep[] = ["A1", "A2", "A3", "A4", "A5"];
const EMPTY: AxisStepState = { questions: [], pending_changes: [], stale_role_ids: [] };

const AxisSidebar = ({
  currentStep,
  stepContext,
  stateByStep,
  loadingStep,
  onRequestQuestions,
  onAnswer,
  onDismiss,
  onReopen,
  onApplyPending,
  onRevertChange,
  onFreeChat,
}: AxisSidebarProps) => {
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [viewedStep, setViewedStep] = useState<AxisStep>(currentStep ?? "A1");
  const [userPinned, setUserPinned] = useState(false);

  useEffect(() => {
    if (!userPinned && currentStep) setViewedStep(currentStep);
  }, [currentStep, userPinned]);

  const stepState = stateByStep[viewedStep] ?? EMPTY;

  const unanswered = useMemo(
    () => stepState.questions.filter((q) => !q.answered_at),
    [stepState.questions],
  );
  const answered = useMemo(
    () => stepState.questions.filter((q) => q.answered_at),
    [stepState.questions],
  );

  const openCounts = useMemo(() => {
    const out: Partial<Record<AxisStep, number>> = {};
    for (const s of STEPS) {
      const st = stateByStep[s];
      if (!st) continue;
      out[s] = st.questions.filter((q) => !q.answered_at).length;
    }
    return out;
  }, [stateByStep]);

  const handleChat = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatBusy(true);
    try {
      await onFreeChat(text);
      setChatText("");
    } finally {
      setChatBusy(false);
    }
  };

  const viewedLoading = loadingStep === viewedStep;
  const canAskQuestions = viewedStep === "A1" || viewedStep === "A2";

  return (
    <aside className="w-full h-full bg-elevated border-l border-border flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded-full bg-gradient-accent-subtle border border-border-accent flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-accent-teal" />
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-label uppercase tracking-[0.15em] text-foreground-secondary">
            NEXUS AXIS
          </span>
          <span className="text-caption text-foreground-muted">
            {STEP_LABELS[viewedStep]}
            {viewedStep !== currentStep && currentStep ? (
              <span className="ml-2 text-foreground-muted/70">
                (viewing — you're on {currentStep})
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Step tabs */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1">
        {STEPS.map((s, idx) => {
          const n = idx + 1;
          const isViewed = s === viewedStep;
          const isCurrent = s === currentStep;
          const open = openCounts[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => {
                setViewedStep(s);
                setUserPinned(s !== currentStep);
              }}
              className={cn(
                "relative w-8 h-8 rounded text-mono-xs font-mono transition-colors flex items-center justify-center",
                isViewed
                  ? "bg-accent-teal/15 text-accent-teal border border-accent-teal/50"
                  : "text-foreground-muted hover:text-foreground hover:bg-surface",
                isCurrent && !isViewed && "ring-1 ring-border-accent/40",
              )}
              title={STEP_LABELS[s] + (open > 0 ? ` · ${open} open` : "")}
            >
              {n}
              {open > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-warning text-[9px] font-semibold text-warning-foreground flex items-center justify-center leading-none">
                  {open}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {canAskQuestions && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={viewedLoading || (viewedStep === currentStep && !stepContext)}
            onClick={() => onRequestQuestions(viewedStep)}
          >
            {viewedLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Thinking…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-2" />
                Help me sharpen this
              </>
            )}
          </Button>
        )}

        {/* Open questions */}
        {unanswered.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            onAnswer={(qq, a) => onAnswer(viewedStep, qq, a)}
            onDismiss={() => onDismiss(viewedStep, q.id)}
          />
        ))}

        {/* Empty state */}
        {unanswered.length === 0 && answered.length === 0 && !viewedLoading && (
          <div className="bg-surface border border-border rounded-card px-4 py-3">
            <p className="text-body-sm text-foreground-secondary">
              {viewedStep === "A1"
                ? "Describe your need or attach files. I'll help sharpen the interpretation."
                : viewedStep === "A2"
                  ? "No questions for this step yet."
                  : "Nothing recorded for this step."}
            </p>
          </div>
        )}

        {/* Decided / answered entries — the audit trail */}
        {answered.length > 0 && (
          <div className="space-y-2">
            <div className="text-label uppercase tracking-[0.15em] text-foreground-muted">
              Decisions
            </div>
            {answered.map((q) => (
              <AnsweredCard
                key={q.id}
                question={q}
                changes={stepState.pending_changes.filter((c) => c.question_id === q.id)}
                onReopen={() => onReopen(viewedStep, q)}
                onApplyPending={onApplyPending}
                onRevertChange={onRevertChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Free chat — always applies to current pipeline step */}
      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-card px-3 py-1.5 focus-within:border-border-accent">
          <input
            type="text"
            placeholder={currentStep ? `Ask Axis (about ${currentStep})…` : "Ask Axis…"}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !chatBusy) handleChat();
            }}
            className="flex-1 bg-transparent text-body-sm text-foreground placeholder:text-foreground-muted outline-none"
            disabled={chatBusy || !currentStep}
          />
          <button
            disabled={chatBusy || !chatText.trim() || !currentStep}
            onClick={handleChat}
            className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-accent-teal disabled:opacity-40"
          >
            {chatBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
};

interface QuestionCardProps {
  question: AxisQuestion;
  onAnswer: (q: AxisQuestion, a: string | string[] | boolean) => Promise<AxisPendingChange[]>;
  onDismiss: () => void;
}

const QuestionCard = ({ question, onAnswer, onDismiss }: QuestionCardProps) => {
  const [singleValue, setSingleValue] = useState<string>("");
  const [multiValue, setMultiValue] = useState<string[]>([]);
  const [textValue, setTextValue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async (val: string | string[] | boolean) => {
    setBusy(true);
    try {
      await onAnswer(question, val);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-card border border-border bg-surface px-3 py-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-body-sm text-foreground">{question.question}</p>
          {question.context && (
            <p className="text-caption text-foreground-muted mt-1">{question.context}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          disabled={busy}
          title="Not relevant — dismiss"
          className="shrink-0 text-foreground-muted/60 hover:text-foreground-muted text-caption px-1.5 py-0.5 rounded hover:bg-background/50 transition-colors"
        >
          Not relevant
        </button>
      </div>

      {question.answer_kind === "single_choice" && question.options && (
        <div className="space-y-1.5">
          {question.options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-body-sm text-foreground hover:text-accent-teal">
              <input type="radio" name={question.id} value={opt.value} checked={singleValue === opt.value} onChange={() => setSingleValue(opt.value)} />
              {opt.label}
            </label>
          ))}
          <Button size="sm" className="mt-2 h-7" disabled={busy || !singleValue} onClick={() => submit(singleValue)}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
          </Button>
        </div>
      )}

      {question.answer_kind === "multi_choice" && question.options && (
        <div className="space-y-1.5">
          {question.options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-body-sm text-foreground">
              <input
                type="checkbox"
                checked={multiValue.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) setMultiValue([...multiValue, opt.value]);
                  else setMultiValue(multiValue.filter((v) => v !== opt.value));
                }}
              />
              {opt.label}
            </label>
          ))}
          <Button size="sm" className="mt-2 h-7" disabled={busy || multiValue.length === 0} onClick={() => submit(multiValue)}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
          </Button>
        </div>
      )}

      {question.answer_kind === "boolean" && (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7" disabled={busy} onClick={() => submit(true)}>Yes</Button>
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => submit(false)}>No</Button>
        </div>
      )}

      {question.answer_kind === "free_text" && (
        <div className="space-y-2">
          <Textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Type your answer…" className="min-h-[60px] text-body-sm" />
          <Button size="sm" className="h-7" disabled={busy || !textValue.trim()} onClick={() => submit(textValue)}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
};

interface AnsweredCardProps {
  question: AxisQuestion;
  changes: AxisPendingChange[];
  onReopen: () => void;
  onApplyPending: (change: AxisPendingChange) => void;
  onRevertChange: (change: AxisPendingChange) => void;
}

const STATE_LABEL: Record<AxisPendingChange["status"], string> = {
  pending: "pending",
  accepted: "accepted",
  rejected: "rejected",
  reverted: "reverted",
  recorded: "recorded for interpretation",
  dismissed: "dismissed",
};
const STATE_CLASS: Record<AxisPendingChange["status"], string> = {
  pending: "text-foreground-secondary",
  accepted: "text-accent-teal",
  rejected: "text-foreground-muted/70 line-through",
  reverted: "text-warning",
  recorded: "text-foreground-muted italic",
  dismissed: "text-foreground-muted italic",
};

const isDismissedOnly = (changes: AxisPendingChange[]) =>
  changes.length === 1 && changes[0].status === "dismissed";

const AnsweredCard = ({ question, changes, onReopen, onApplyPending, onRevertChange }: AnsweredCardProps) => {
  const dismissed = isDismissedOnly(changes);
  const pending = changes.find((c) => c.status === "pending");

  // User answer rendering (skipped when dismissed — answer is meaningless).
  const answerDisplay = (() => {
    if (dismissed) return "Dismissed";
    const a = question.answer;
    if (typeof a === "boolean") return a ? "Yes" : "No";
    const labelOf = (val: string) =>
      question.options?.find((o) => o.value === val)?.label ?? val;
    if (Array.isArray(a)) return a.map(labelOf).join(", ") || "—";
    if (typeof a === "string") {
      if (question.answer_kind === "single_choice") return labelOf(a);
      return a || "—";
    }
    return "—";
  })();

  // Effect lines: never restate the question. Just label + state.
  // Filter out the dismissed sentinel when we're already showing "Dismissed" as the answer.
  const effectLines = dismissed
    ? []
    : changes.filter((c) => c.status !== "dismissed");

  return (
    <div className="rounded-card border border-border bg-surface/60 px-3 py-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-body-sm text-foreground leading-snug flex-1">{question.question}</p>
        <button
          onClick={onReopen}
          title="Reopen this decision"
          className="shrink-0 inline-flex items-center gap-1 text-caption text-foreground-muted hover:text-accent-teal px-1.5 py-0.5 rounded hover:bg-background/50 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Reopen
        </button>
      </div>

      <p className={cn("text-body-sm", dismissed ? "text-foreground-muted italic" : "text-foreground-secondary")}>
        <span className="text-foreground-muted">→ </span>
        {answerDisplay}
      </p>

      {/* Pending free-text preview — "Axis understood: …" with Apply / Edit. */}
      {pending && (
        <div className="rounded border border-dashed border-accent-teal/60 bg-background/40 px-2.5 py-2 mt-1 space-y-1.5">
          <p className="text-caption text-foreground-secondary">
            Axis understood:
          </p>
          <p className="text-body-sm text-foreground font-mono">→ {pending.label}</p>
          <div className="flex items-center gap-2 pt-0.5">
            <Button size="sm" className="h-6 px-2 text-xs" onClick={() => onApplyPending(pending)}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={onReopen}
            >
              Edit answer
            </Button>
          </div>
        </div>
      )}

      {/* Effect lines (post-apply / recorded). */}
      {effectLines.length > 0 && !pending && (
        <div className="space-y-0.5 pt-0.5">
          {effectLines.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2">
              <p className={cn("text-caption font-mono flex-1", STATE_CLASS[c.status])}>
                {c.status === "recorded"
                  ? `→ ${STATE_LABEL[c.status]}`
                  : `→ ${c.label} · ${STATE_LABEL[c.status]}`}
              </p>
              {c.status === "accepted" && (
                <button
                  onClick={() => onRevertChange(c)}
                  title="Revert this change"
                  className="shrink-0 inline-flex items-center gap-1 text-caption text-foreground-muted hover:text-warning px-1.5 py-0.5 rounded hover:bg-background/50 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Revert
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AxisSidebar;
