// Profile-3 / D-unify-a: thin compatibility wrapper around SharedVerificationBody.
// Re-exports the public API that callers were using (CompleteAndVerifyBody,
// CompletionDecision, CompletionSeed, SeedPill, seedFromAnalysisData,
// emptyCompletionSeed, flattenAnalysisSection).
//
// New code should import directly from
//   @/components/verification/SharedVerificationBody
//
// This wrapper translates the old prop shape (websiteUrl / initialEvidenceUrl)
// into the new shape (urlSeed / evidenceSeed, mode).
import {
  SharedVerificationBody,
  type CompletionDecision,
  type CompletionSeed,
  type SeedPill,
} from "@/components/verification/SharedVerificationBody";

export {
  flattenAnalysisSection,
  seedFromAnalysisData,
  emptyCompletionSeed,
} from "@/components/verification/SharedVerificationBody";
export type { CompletionAction, CompletionDecision, CompletionSeed, SeedPill, SectionKey }
  from "@/components/verification/SharedVerificationBody";

interface Props {
  websiteUrl: string | null;
  actorContext: { actor_name: string; country: string | null };
  seed: CompletionSeed;
  initialEvidenceUrl?: string | null;
  onEnrichmentUrlCommit?: (url: string) => void;
  onChange: (payload: {
    decisions: CompletionDecision[];
    removedExistingTagIds: string[];
  }) => void;
}

export const CompleteAndVerifyBody = ({
  websiteUrl,
  actorContext,
  seed,
  initialEvidenceUrl,
  onEnrichmentUrlCommit,
  onChange,
}: Props) => (
  <SharedVerificationBody
    mode="from-queue"
    actorContext={actorContext}
    seed={seed}
    urlSeed={websiteUrl}
    evidenceSeed={initialEvidenceUrl ?? null}
    onEnrichmentUrlCommit={onEnrichmentUrlCommit}
    onChange={onChange}
  />
);

// Suppress unused-import warnings for the type re-exports above.
export type _Reexports = { _decision: CompletionDecision; _seed: CompletionSeed; _pill: SeedPill };
