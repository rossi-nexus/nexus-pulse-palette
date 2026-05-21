import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Award,
  Bell,
  CheckCircle,
  ShieldCheck,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { NotificationEntry } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

type EventKey =
  | "approve_and_verify"
  | "verify"
  | "reject_suggestion"
  | "onboard_verified_actor"
  | "record_outcome";

const EVENT_META: Record<EventKey, { icon: LucideIcon; title: (name: string) => string }> = {
  approve_and_verify: { icon: CheckCircle, title: (n) => `Actor ${n} approved` },
  verify: { icon: ShieldCheck, title: (n) => `Actor ${n} verified` },
  reject_suggestion: { icon: XCircle, title: (n) => `Suggestion rejected: ${n}` },
  onboard_verified_actor: { icon: UserPlus, title: (n) => `Onboarded ${n}` },
  record_outcome: { icon: Award, title: (n) => `Outcome recorded for ${n}` },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function actorNameFromChanges(changes: unknown): string | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Record<string, any>;
  return (
    c.actor_name ||
    c.legal_name ||
    c.name ||
    c.new?.legal_name ||
    c.new?.actor_name ||
    null
  );
}

function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "unknown";
}

function renderEntry(entry: NotificationEntry, unread: boolean) {
  if (entry.kind === "decay") {
    const Icon = AlertTriangle;
    const title =
      entry.state === "expired"
        ? `${entry.legal_name} expired`
        : `${entry.legal_name} needs re-verification`;
    return {
      icon: Icon,
      iconTone: entry.state === "expired" ? "text-destructive" : "text-warning",
      title,
      subtitle: timeAgo(entry.decays_at),
      to: `/actors/${entry.actor_id}`,
      unread,
    };
  }
  const meta = EVENT_META[entry.event_type as EventKey];
  if (!meta) return null;
  const name = actorNameFromChanges(entry.changes) ?? `Actor ${shortId(entry.actor_id)}`;
  const to =
    entry.event_type === "reject_suggestion"
      ? "/consultant/verification"
      : entry.event_type === "record_outcome" && entry.programme_id
        ? `/consultant/programmes/${entry.programme_id}`
        : entry.actor_id
          ? `/actors/${entry.actor_id}`
          : "/pipeline";
  return {
    icon: meta.icon,
    iconTone:
      entry.event_type === "reject_suggestion" ? "text-destructive" : "text-success",
    title: meta.title(name),
    subtitle: timeAgo(entry.created_at),
    to,
    unread,
  };
}

interface Props {
  entries: NotificationEntry[];
  unreadCount: number;
  lastSeenAt: string;
  loading: boolean;
  onMarkAllRead: () => void;
  onItemClick?: () => void;
}

export function NotificationsDropdown({
  entries,
  unreadCount,
  lastSeenAt,
  loading,
  onMarkAllRead,
  onItemClick,
}: Props) {
  const visible = entries.slice(0, 20);

  return (
    <div className="w-[360px] max-h-[480px] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Notifications</span>
        <button
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="text-xs text-foreground-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark all read
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && visible.length === 0 ? (
          <div className="px-4 py-8 text-xs text-foreground-muted text-center">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
            <Bell className="w-5 h-5 text-foreground-muted opacity-50" />
            <span className="text-xs italic text-foreground-muted">No recent notifications</span>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((entry) => {
              const ts = entry.kind === "audit" ? entry.created_at : entry.decays_at;
              const unread = ts > lastSeenAt;
              const rendered = renderEntry(entry, unread);
              if (!rendered) return null;
              const Icon = rendered.icon;
              return (
                <li key={entry.id}>
                  <Link
                    to={rendered.to}
                    onClick={onItemClick}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors",
                      rendered.unread && "border-l-2 border-l-accent bg-surface/40",
                    )}
                  >
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", rendered.iconTone)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{rendered.title}</div>
                      <div className="text-xs text-foreground-muted mt-0.5">{rendered.subtitle}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-4 py-2 border-t border-border">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
          Showing recent activity from the last 30 days
        </span>
      </div>
    </div>
  );
}
