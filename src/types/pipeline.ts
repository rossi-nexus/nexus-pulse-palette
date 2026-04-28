/**
 * Pipeline step locked-output contracts (P22 retrofit, Phase 6.5.4.5).
 *
 * Downstream pipeline steps consume upstream output via these typed shapes —
 * exactly as persisted into `session_step_states.locked_output` by the
 * producing step's hook. PipelineView reads the locked rows and passes the
 * structured data down; downstream step components do NOT read live state
 * from upstream hooks.
 *
 * The shapes mirror what `useSearch.lock()` and `useAnalysis.lock()` write.
 */
import type { RoleSearchResult } from "@/hooks/useSearch";
import type { RoleAnalysisProgress } from "@/hooks/useAnalysis";

/** A3 locked output — exactly what `useSearch.lock()` persists. */
export interface LockedA3Output {
  roleResults: RoleSearchResult[];
}

/** A4 locked output — exactly what `useAnalysis.lock()` persists. */
export interface LockedA4Output {
  roleProgress: RoleAnalysisProgress[];
}
