import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShieldCheck, ListChecks, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTopbarStats } from "@/hooks/useTopbarStats";

type Tone = "default" | "warning";

interface ChipProps {
  label: string;
  value: string;
  tone?: Tone;
  icon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  collapse?: boolean;
}

function useCountUp(value: number | null, prefersReducedMotion: boolean) {
  const [display, setDisplay] = useState<number | null>(value);
  const fromRef = useRef<number | null>(value);
  useEffect(() => {
    if (value === null) {
      setDisplay(null);
      fromRef.current = null;
      return;
    }
    if (prefersReducedMotion || fromRef.current === null) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 360;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, prefersReducedMotion]);
  return display;
}

const StatusChip = ({ label, value, tone = "default", icon, onClick, title, collapse }: ChipProps) => {
  const accent = tone === "warning" ? "before:bg-warning" : "before:bg-accent-teal";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={cn(
        "relative group flex items-center gap-2.5 h-11 rounded-md bg-elevated border border-border",
        "pl-3.5 pr-3 transition-all duration-150",
        "hover:border-border-accent hover:-translate-y-px hover:bg-elevated/80",
        "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r",
        accent,
      )}
    >
      {icon && <span className={cn("shrink-0", tone === "warning" ? "text-warning" : "text-foreground-secondary")}>{icon}</span>}
      {collapse ? (
        <span className={cn("font-mono text-[15px] font-bold tabular-nums leading-none", tone === "warning" ? "text-warning" : "text-foreground")}>
          {value}
        </span>
      ) : (
        <span className="flex flex-col items-start leading-none">
          <span className={cn("font-mono text-[19px] font-bold tabular-nums leading-none", tone === "warning" ? "text-warning" : "text-foreground")}>
            {value}
          </span>
          <span className="mt-1 text-[9.5px] uppercase tracking-[0.14em] text-foreground-muted font-medium">
            {label}
          </span>
        </span>
      )}
    </button>
  );
};

export default function StatusChips() {
  const stats = useTopbarStats();
  const navigate = useNavigate();
  const [narrow, setNarrow] = useState(false);
  const prm =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const m = window.matchMedia("(max-width: 1100px)");
    const h = () => setNarrow(m.matches);
    h();
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);

  const verified = useCountUp(stats.verified, prm);
  const pending = useCountUp(stats.pending, prm);
  const decay = useCountUp(stats.decay, prm);

  if (stats.loading) return null;

  return (
    <div className="flex items-center gap-2">
      {stats.step !== null && (
        <StatusChip
          label="Step"
          value={`${stats.step}/${stats.totalSteps}`}
          icon={<Activity className="w-3.5 h-3.5" />}
          onClick={() => navigate("/pipeline")}
          collapse={narrow}
        />
      )}
      {verified !== null && (
        <StatusChip
          label="Verified"
          value={String(verified)}
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          onClick={() => navigate("/actors")}
          collapse={narrow}
        />
      )}
      {pending !== null && (
        <StatusChip
          label="Pending"
          value={String(pending)}
          icon={<ListChecks className="w-3.5 h-3.5" />}
          onClick={() => navigate("/consultant/verification")}
          collapse={narrow}
        />
      )}
      {decay !== null && (
        <StatusChip
          label="Decay <30d"
          value={String(decay)}
          tone={decay > 0 ? "warning" : "default"}
          icon={<AlertTriangle className="w-3.5 h-3.5" />}
          onClick={() => navigate("/consultant/verification?filter=decay")}
          collapse={narrow}
        />
      )}
    </div>
  );
}
