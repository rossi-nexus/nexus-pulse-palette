// V3 Actor Card Batch A — Macro-card container.
// Wraps groups of existing ProfileSection blocks under a bold header with:
//   - a presence dot (complete / partial / missing / stale)
//   - a verification colour band on the left edge
//   - a collapsible body whose open/closed state persists per user+actor+card
//     via localStorage (Batch A §2).
import * as React from "react";
import { ChevronDown, CheckCircle2, MinusCircle, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PresenceState = "complete" | "partial" | "missing" | "stale";
export type TrustBand = "verified" | "pending" | "auto" | "user" | "stale" | "neutral";

interface Props {
  /** Bold display title at the top of the card. */
  title: string;
  /** Optional subtitle / count rendered next to the title. */
  subtitle?: React.ReactNode;
  /** Right-aligned slot for header actions (e.g. "Complete this card" button — Batch B). */
  headerExtra?: React.ReactNode;
  /** Presence dot state — drives the small icon next to the title. */
  presence: PresenceState;
  /** Verification colour for the left edge band. */
  trust: TrustBand;
  /** Used together with viewerId + actorId to scope persisted collapsed state. */
  cardKey: string;
  viewerId?: string | null;
  actorId?: string | null;
  defaultOpen?: boolean;
  /** Slate-tinted background variant — used for the My Collection card to mark it as
   *  not-canonical. */
  variant?: "default" | "collection";
  children: React.ReactNode;
}

const PRESENCE: Record<PresenceState, { Icon: React.ComponentType<{ className?: string }>; tip: string; cls: string }> = {
  complete: { Icon: CheckCircle2, tip: "Complete", cls: "text-success" },
  partial: { Icon: MinusCircle, tip: "Partial", cls: "text-warning" },
  missing: { Icon: Circle, tip: "Missing", cls: "text-foreground-muted" },
  stale: { Icon: AlertTriangle, tip: "Stale — past decay date", cls: "text-destructive" },
};

const TRUST_BAND: Record<TrustBand, string> = {
  verified: "bg-success/70",
  pending: "bg-warning/70",
  auto: "bg-foreground-muted/40",
  user: "bg-accent-blue/70",
  stale: "bg-destructive/70",
  neutral: "bg-border",
};

function persistKey(card: string, viewer?: string | null, actor?: string | null): string {
  return `actor-card:${viewer ?? "anon"}:${actor ?? "—"}:${card}:open`;
}

export const MacroCard: React.FC<Props> = ({
  title,
  subtitle,
  headerExtra,
  presence,
  trust,
  cardKey,
  viewerId,
  actorId,
  defaultOpen = true,
  variant = "default",
  children,
}) => {
  const storeKey = persistKey(cardKey, viewerId, actorId);
  const [open, setOpen] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const raw = window.localStorage.getItem(storeKey);
    if (raw === null) return defaultOpen;
    return raw === "1";
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storeKey, open ? "1" : "0");
  }, [open, storeKey]);

  const Presence = PRESENCE[presence];

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-md border border-border/70 mt-4",
        variant === "collection"
          ? "bg-elevated/60 border-dashed"
          : "bg-surface/60",
      )}
    >
      {/* Trust colour band on the left edge */}
      <span
        aria-hidden
        className={cn("absolute left-0 top-0 bottom-0 w-1", TRUST_BAND[trust])}
      />
      <header className="flex items-center justify-between gap-3 pl-5 pr-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 text-left group min-w-0 flex-1"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "w-4 h-4 text-foreground-muted transition-transform shrink-0",
              open && "rotate-180",
            )}
          />
          <h2 className="text-lg font-semibold tracking-tight text-foreground truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="text-xs text-foreground-muted truncate">{subtitle}</span>
          )}
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {headerExtra}
          <span
            title={Presence.tip}
            aria-label={Presence.tip}
            className={cn("inline-flex items-center", Presence.cls)}
          >
            <Presence.Icon className="w-4 h-4" />
          </span>
        </div>
      </header>
      {open && (
        <div className="pl-5 pr-4 pb-4 -mt-1">
          {/* Children are existing ProfileSection blocks. The first one's top border
              acts as the divider between the header and the body. */}
          {children}
        </div>
      )}
    </section>
  );
};

export default MacroCard;
