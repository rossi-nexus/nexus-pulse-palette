// SX-03 — Axis-as-questioner shared types.
// Per Rule #24, lives in src/types/ and is the single source of truth.

import type { ClarificationPoint } from "./interpretation";

export type AxisStep = "A1" | "A2" | "A3" | "A4" | "A5";

export type AxisActionKind =
  | "update_constraint"
  | "rescope_role"
  | "rerun_role"
  | "set_effect_chain"
  | "context"
  | "noop";

/** A concrete change Axis proposes. `target` is a dotted path into the interpretation/role tree. */
export interface AxisAction {
  kind: AxisActionKind;
  /** e.g. "constraints.geography.sourcing_intent", "roles.<role_id>.targets.productTypes" */
  target?: string;
  value?: unknown;
  /** Optional human-readable summary for the sidebar pill. */
  label?: string;
}

export type AxisAnswerKind =
  | "free_text"
  | "single_choice"
  | "multi_choice"
  | "boolean";

export interface AxisAnswerOption {
  value: string;
  label: string;
  /** Optional override action for this specific option. Falls back to question.proposed_action. */
  action?: AxisAction;
}

export interface AxisQuestion {
  id: string;
  step: AxisStep;
  question: string;
  /** Short "why we're asking" line. */
  context: string;
  answer_kind: AxisAnswerKind;
  options?: AxisAnswerOption[];
  /** Bound action template for choice/boolean answers. */
  proposed_action: AxisAction;
  answered_at?: string;
  answer?: string | string[] | boolean;
  applied_change_ids?: string[];
  /** Origin marker — distinguishes a folded-in clarification_point from a fresh Axis-generated question. */
  origin?: "axis" | "clarification";
}

/** A pending tracked change emitted by axis-resolve and awaiting accept/reject. */
export interface AxisPendingChange {
  id: string;
  step: AxisStep;
  source: "axis";
  status: "pending" | "accepted" | "rejected";
  action: AxisAction;
  /** Human-readable label, e.g. "Sourcing intent → National". */
  label: string;
  message?: string;
  question_id?: string;
  created_at: string;
}

/** Axis state persisted into session_step_states.locked_output (additive JSONB key). */
export interface AxisStepState {
  questions: AxisQuestion[];
  pending_changes: AxisPendingChange[];
  stale_role_ids?: string[];
}

export type AxisStateByStep = Partial<Record<AxisStep, AxisStepState>>;

// Re-export for compatibility — ClarificationPoint stays untouched but folded in by axis-question.
export type { ClarificationPoint };
