/** Session & pipeline state types */

export type StepId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
export type StepStatus = 'not_started' | 'editing' | 'locked';
export type SessionStatus = 'active' | 'completed' | 'archived';

export interface StepState {
  id: string;
  sessionId: string;
  step: StepId;
  status: StepStatus;
  lockedOutput?: Record<string, unknown>;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchSession {
  id: string;
  userId: string;
  name?: string;
  projectId?: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  autoSavedAt?: string;
  steps?: StepState[];
}
