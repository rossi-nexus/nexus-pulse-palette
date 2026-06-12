// SX-03 / SX-04b — Axis sidebar with step tabs + auditable answer record.
//
// SX-04b changes:
//  - Step tabs 1..5: viewedStep follows currentStep (pipeline step) but the user
//    can click any tab to review another step. Tabs with open questions show a
//    count badge.
//  - Answered cards now show the trio: question → user's answer → effect line
//    with state (accepted / rejected / reverted / recorded for interpretation).
//  - Decisions are never deleted; reverted changes still surface with state
//    "reverted" as the audit trail.
//  - Free chat applies to the user's current pipeline step (not the viewed tab).

import { useEffect, useMemo, useState } from "react";
import { Bot, Send, Sparkles, Check, X, Loader2 } from "lucide-react";
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
  /** Full per-step state so the user can review any tab. */
  stateByStep: AxisStateByStep;
  /** Step currently being loaded by axis-question, if any. */
  loadingStep: AxisStep | null;
  onRequestQuestions: (step: AxisStep) => void;
  onAnswer: (step: AxisStep, question: AxisQuestion, answer: string | string[] | boolean) => Promise<AxisPendingChange[]>;
  onAcceptChange: (change: AxisPendingChange) => void;
  onRejectChange: (change: AxisPendingChange) => void;
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
  onAcceptChange,
  onRejectChange,
  onFreeChat,
}: AxisSidebarProps) => {
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [viewedStep, setViewedStep] = useState<AxisStep>(currentStep ?? "A1");
  const [userPinned, setUserPinned] = useState(false);

  // Auto-follow current pipeline step unless the user has clicked a tab manually.
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
  const pending = useMemo(
    () => stepState.pending_changes.filter((c) => c.status === "pending"),
    [stepState.pending_changes],
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
        {/* Sharpen-this button — only on A1/A2 viewed tab */}
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

        {/* Pending tracked changes */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <div className="text-label uppercase tracking-[0.15em] text-foreground-secondary">
              Pending changes
            </div>
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-card border border-dashed border-accent-teal/60 bg-surface/40 px-3 py-2.5 space-y-2"
              >
                <p className="text-body-sm text-foreground">{c.label}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => onAcceptChange(c)}>
                    <Check className="w-3 h-3 mr-1" /> Accept
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRejectChange(c)}>
                    <X className="w-3 h-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Open questions */}
        {unanswered.map((q) => (
          <QuestionCard key={q.id} question={q} onAnswer={(qq, a) => onAnswer(viewedStep, qq, a)} />
        ))}

        {/* Empty state */}
        {unanswered.length === 0 && pending.length === 0 && answered.length === 0 && !viewedLoading && (
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
}

const QuestionCard = ({ question, onAnswer }: QuestionCardProps) => {
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
      <div>
        <p className="text-body-sm text-foreground">{question.question}</p>
        {question.context && (
          <p className="text-caption text-foreground-muted mt-1">{question.context}</p>
        )}
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
}

/** Render a compact, auditable record of an answered question. */
const AnsweredCard = ({ question, changes }: AnsweredCardProps) => {
  // Display the user's answer using the option label when available.
  const answerDisplay = (() => {
    const a = question.answer;
    if (typeof a === "boolean") return a ? "Yes" : "No";
    const labelOf = (val: string) =>
      question.options?.find((o) => o.value === val)?.label ?? val;
    if (Array.isArray(a)) return a.map(labelOf).join(", ") || "—";
    if (typeof a === "string") {
      // For choice questions, map value → label; for free_text, show as-is.
      if (question.answer_kind === "single_choice") return labelOf(a);
      return a || "—";
    }
    return "—";
  })();

  const STATE_LABEL: Record<AxisPendingChange["status"], string> = {
    pending: "pending",
    accepted: "accepted",
    rejected: "rejected",
    reverted: "reverted",
  };
  const STATE_CLASS: Record<AxisPendingChange["status"], string> = {
    pending: "text-foreground-muted",
    accepted: "text-accent-teal",
    rejected: "text-foreground-muted/70 line-through",
    reverted: "text-warning",
  };

  return (
    <div className="rounded-card border border-border bg-surface/60 px-3 py-2.5 space-y-1.5">
      <p className="text-caption text-foreground-secondary leading-snug">{question.question}</p>
      <p className="text-body-sm text-foreground">
        <span className="text-foreground-muted">→ </span>
        {answerDisplay}
      </p>
      {changes.length > 0 ? (
        <div className="space-y-0.5 pt-0.5">
          {changes.map((c) => (
            <p key={c.id} className={cn("text-caption font-mono", STATE_CLASS[c.status])}>
              ↳ {c.label} · {STATE_LABEL[c.status]}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-caption text-foreground-muted/80 italic">
          ↳ recorded for interpretation
        </p>
      )}
    </div>
  );
};

export default AxisSidebar;
