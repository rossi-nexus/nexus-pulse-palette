/** Audit log types (Phase 6.5.4).
 *
 * The audit_log table is written by:
 *   - fn_audit_log_trigger (attached to 9 sensitive tables): event_type='mutation'
 *   - RPCs via fn_audit_log_event helper: named event types (suggest/verify/promote/...)
 *
 * No UI surface consumes these types in 6.5.4 — they exist for 6.5.5 to read
 * when the customer-facing log view lands.
 */

export type AuditEventType =
  | 'mutation'
  | 'suggest'
  | 'verify'
  | 'promote';

export interface AuditLogEntry {
  id: string;
  event_type: AuditEventType;
  target_table: string;
  target_record_id: string | null;
  actor_id: string | null;
  programme_id: string | null;
  actor_user_id: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}
