// SX-03 — Axis sidebar. Asks per-step questions, captures answers, surfaces
// pending tracked changes for accept/reject. Free chat input maps user text to
// the same tracked-change pipeline.

import { useState, useMemo } from "react";
import { Bot, Send, Sparkles, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AxisQuestion,
  AxisStep,
  AxisStepState,
  AxisPendingChange,
} from "@/types/axis";

interface AxisSidebarProps {
  currentStep: AxisStep | null;
  stepContext: any;
  stepState: AxisStepState;
  loading: boolean;
  onRequestQuestions: () => void;
  onAnswer: (question: AxisQuestion, answer: string | string[] | boolean) => Promise<AxisPendingChange[]>;
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

const AxisSidebar = ({
  currentStep,
  stepContext,
  stepState,
  loading,
  onRequestQuestions,
  onAnswer,
  onAcceptChange,
  onRejectChange,
  onFreeChat,
}: AxisSidebarProps) => {
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const unanswered = useMemo(
    () => stepState.questions.filter((q) => !q.answered_at),
    [stepState.questions],
  );
  const pending = useMemo(
    () => stepState.pending_changes.filter((c) => c.status === "pending"),
    [stepState.pending_changes],
  );

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
          {currentStep && (
            <span className="text-caption text-foreground-muted">
              {STEP_LABELS[currentStep]}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {/* Sharpen-this button */}
        {currentStep && (currentStep === "A1" || currentStep === "A2") && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loading || !stepContext}
            onClick={onRequestQuestions}
          >
            {loading ? (
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
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-2 text-xs"
                    onClick={() => onAcceptChange(c)}
                  >
                    <Check className="w-3 h-3 mr-1" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => onRejectChange(c)}
                  >
                    <X className="w-3 h-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Questions */}
        {unanswered.length === 0 && pending.length === 0 && !loading && (
          <div className="bg-surface border border-border rounded-card px-4 py-3">
            <p className="text-body-sm text-foreground-secondary">
              {currentStep === "A1"
                ? "Describe your need or attach files. I'll help sharpen the interpretation in the next step."
                : currentStep === "A2"
                  ? "No questions for this step. You can still ask me anything below."
                  : "No questions for this step."}
            </p>
          </div>
        )}

        {unanswered.map((q) => (
          <QuestionCard key={q.id} question={q} onAnswer={onAnswer} />
        ))}

        {/* Answered questions (collapsed) */}
        {stepState.questions.filter((q) => q.answered_at).map((q) => (
          <div
            key={q.id}
            className="rounded-card border border-border bg-surface/40 px-3 py-2 opacity-70"
          >
            <p className="text-caption text-foreground-secondary">{q.question}</p>
            <p className="text-caption text-foreground-muted mt-0.5">
              Answered ✓
            </p>
          </div>
        ))}
      </div>

      {/* Free chat */}
      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-card px-3 py-1.5 focus-within:border-border-accent">
          <input
            type="text"
            placeholder="Ask Axis…"
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
            <label
              key={opt.value}
              className="flex items-center gap-2 cursor-pointer text-body-sm text-foreground hover:text-accent-teal"
            >
              <input
                type="radio"
                name={question.id}
                value={opt.value}
                checked={singleValue === opt.value}
                onChange={() => setSingleValue(opt.value)}
              />
              {opt.label}
            </label>
          ))}
          <Button
            size="sm"
            className="mt-2 h-7"
            disabled={busy || !singleValue}
            onClick={() => submit(singleValue)}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
          </Button>
        </div>
      )}

      {question.answer_kind === "multi_choice" && question.options && (
        <div className="space-y-1.5">
          {question.options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 cursor-pointer text-body-sm text-foreground"
            >
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
          <Button
            size="sm"
            className="mt-2 h-7"
            disabled={busy || multiValue.length === 0}
            onClick={() => submit(multiValue)}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
          </Button>
        </div>
      )}

      {question.answer_kind === "boolean" && (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7" disabled={busy} onClick={() => submit(true)}>
            Yes
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => submit(false)}>
            No
          </Button>
        </div>
      )}

      {question.answer_kind === "free_text" && (
        <div className="space-y-2">
          <Textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="Type your answer…"
            className="min-h-[60px] text-body-sm"
          />
          <Button
            size="sm"
            className="h-7"
            disabled={busy || !textValue.trim()}
            onClick={() => submit(textValue)}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AxisSidebar;
