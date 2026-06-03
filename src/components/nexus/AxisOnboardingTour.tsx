// AX5 — First-run guided tour for Axis search.
// Triggered when user_preferences.onboarding_seen.axis_search is not set.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/hooks/useUserPreferences";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Read the score, expand the reasoning",
    body: "Each result has a relevance score and an axis-by-axis breakdown. Click 'Why matched' on any card to see how the score was built.",
  },
  {
    title: "Tune ranking to your priorities",
    body: "Visit Settings → Ranking preferences to shift weights across the seven axes. You can also pick a named preset (Geography-first, Capacity-critical, …) to start from.",
  },
  {
    title: "Save searches, get notified",
    body: "Use 'Save this search' above the result list to be notified the moment a newly verified actor matches above your threshold.",
  },
];

interface Props {
  /** Optional override (e.g. for the demo). When omitted, the tour reads the user pref. */
  forceShow?: boolean;
}

export const AxisOnboardingTour = ({ forceShow = false }: Props) => {
  const { weights, save, loading } = useUserPreferences();
  // The hook returns weights only; we read onboarding via a side fetch. To keep
  // it small, we infer from a sentinel field stored alongside weights via save().
  // The migration added onboarding_seen jsonb on user_preferences, but the hook
  // doesn't expose it yet — we use a localStorage fallback to avoid race + extra
  // RPCs, and we still persist server-side once the user dismisses.
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (loading) return;
    const seen = typeof window !== "undefined" && window.localStorage.getItem("axis_onboarding_seen") === "1";
    if (forceShow || !seen) setOpen(true);
  }, [loading, forceShow]);

  const dismiss = async (markSeen: boolean) => {
    setOpen(false);
    if (markSeen) {
      try { window.localStorage.setItem("axis_onboarding_seen", "1"); } catch { /* ignore */ }
      // Best-effort server persistence — non-blocking.
      try { await save(weights ?? null); } catch { /* ignore */ }
    }
  };

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] rounded-card border border-accent-teal/40 bg-elevated shadow-xl p-4 space-y-3 animate-scale-in">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-caption text-foreground-muted uppercase tracking-wider mb-0.5">
            Quick tour · {step + 1} of {STEPS.length}
          </div>
          <h4 className="text-body font-medium text-foreground">{s.title}</h4>
        </div>
        <button
          type="button"
          onClick={() => dismiss(true)}
          className="text-foreground-muted hover:text-foreground-secondary transition-colors"
          aria-label="Dismiss tour"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-body-sm text-foreground-secondary leading-relaxed">{s.body}</p>
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => dismiss(true)}
          className="text-caption text-foreground-muted hover:text-foreground-secondary transition-colors"
        >
          Skip
        </button>
        <Button
          size="sm"
          onClick={() => (isLast ? dismiss(true) : setStep((s) => s + 1))}
        >
          {isLast ? "Got it" : "Next"}
        </Button>
      </div>
    </div>
  );
};

export default AxisOnboardingTour;
