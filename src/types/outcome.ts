// Phase 6.5.6: programme outcomes (closed-loop feedback).
export type OutcomeType =
  | "engaged"
  | "contracted"
  | "delivered"
  | "disappointed"
  | "declined";

export const OUTCOME_TYPES: OutcomeType[] = [
  "engaged",
  "contracted",
  "delivered",
  "disappointed",
  "declined",
];

export const OUTCOME_LABEL: Record<OutcomeType, string> = {
  engaged: "Engaged",
  contracted: "Contracted",
  delivered: "Delivered",
  disappointed: "Disappointed",
  declined: "Declined",
};

export interface OutcomeEvidenceItem {
  source_url?: string;
  note?: string;
}

export interface ProgrammeOutcome {
  id: string;
  programme_id: string;
  actor_id: string;
  outcome_type: OutcomeType;
  notes: string | null;
  evidence: OutcomeEvidenceItem[];
  recorded_by: string | null;
  recorded_at: string;
  completed_at: string | null;
}

export interface ProgrammeOutcomeWithContext extends ProgrammeOutcome {
  recorded_by_name: string | null;
  programme_name: string;
  actor_name: string;
}

export interface OutcomeSummary {
  engaged: number;
  contracted: number;
  delivered: number;
  disappointed: number;
  declined: number;
}

export const EMPTY_OUTCOME_SUMMARY: OutcomeSummary = {
  engaged: 0,
  contracted: 0,
  delivered: 0,
  disappointed: 0,
  declined: 0,
};
