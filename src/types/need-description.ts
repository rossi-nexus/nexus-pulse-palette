/** Attachment reference — file in storage or URL */
export interface NeedAttachment {
  type: 'file' | 'url';
  /** Original filename or URL */
  reference: string;
  /** For files: path in the need-attachments storage bucket */
  storage_path?: string;
}

/** A1 — Define Your Need: user context + attachment references */
export interface NeedDescription {
  id: string;
  session_id: string;
  /** User's own description / context text (optional if attachments exist) */
  context_text?: string;
  /** File and URL attachments */
  attachments: NeedAttachment[];
  /** ISO 8601 timestamp when the step was locked */
  locked_at: string;
}
