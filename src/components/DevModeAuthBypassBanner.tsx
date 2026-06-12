import { AUTH_BYPASS_ACTIVE } from "@/lib/devAuthBypass";
import { AlertTriangle } from "lucide-react";

export function DevModeAuthBypassBanner() {
  if (!AUTH_BYPASS_ACTIVE) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 h-8 bg-warning text-warning-foreground text-[11px] font-mono tracking-wide uppercase border-l-4 border-warning-foreground/30">
      <AlertTriangle className="w-3.5 h-3.5" />
      DEV MODE — Authentication bypassed via VITE_ALLOW_AUTH_BYPASS. Not for production.
    </div>
  );
}
