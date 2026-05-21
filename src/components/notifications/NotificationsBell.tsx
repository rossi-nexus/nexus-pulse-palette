import { useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { entries, unreadCount, lastSeenAt, loading, markAllRead } = useNotifications();

  const hasUnread = unreadCount > 0;
  const Icon = hasUnread ? BellRing : Bell;
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hasUnread ? `Notifications (${badge} unread)` : "Notifications"}
          className={cn(
            "relative w-8 h-8 rounded-full flex items-center justify-center transition-colors",
            "text-foreground-muted hover:text-foreground hover:bg-surface",
          )}
        >
          <Icon className="w-4 h-4" />
          {hasUnread && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-[10px] font-medium text-background flex items-center justify-center leading-none"
            >
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="p-0 w-auto bg-elevated border-border"
      >
        <NotificationsDropdown
          entries={entries}
          unreadCount={unreadCount}
          lastSeenAt={lastSeenAt}
          loading={loading}
          onMarkAllRead={markAllRead}
          onItemClick={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
