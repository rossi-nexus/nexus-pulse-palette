import { AUTH_BYPASS_ACTIVE } from "@/lib/devAuthBypass";

export function DevModeAuthBypassBanner() {
  if (!AUTH_BYPASS_ACTIVE) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center h-8 bg-warning text-warning-foreground text-[11px] font-mono tracking-wide uppercase">
      ⚠️ DEV MODE — Authentication bypassed via VITE_ALLOW_AUTH_BYPASS. Not for production.
    </div>
  );
}
