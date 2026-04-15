/** A1 — Define Your Need: the raw user input describing what they're looking for */
export interface NeedDescription {
  /** Free-text description of the procurement need */
  description: string;
  /** Optional title the user gives their search */
  title?: string;
  /** Optional urgency or timeline */
  timeline?: string;
  /** Optional budget range or constraints */
  budget?: string;
  /** Any additional context */
  context?: string;
}
