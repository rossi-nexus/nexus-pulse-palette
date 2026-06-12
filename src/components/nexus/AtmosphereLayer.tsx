import { cn } from "@/lib/utils";
import bgLogin from "@/assets/bg-login.jpg.asset.json";
import bgEmpty from "@/assets/bg-empty.jpg.asset.json";

type Variant = "login" | "empty" | "pipeline";

const VARIANTS: Record<Variant, { url: string; opacity: number; overlay: string; pos: string }> = {
  login: {
    url: bgLogin?.url ?? "",
    opacity: 0.35,
    overlay:
      "linear-gradient(180deg, hsl(240 20% 4% / 0.75) 0%, hsl(240 20% 4% / 0.86) 50%, hsl(240 20% 4% / 0.92) 100%)",
    pos: "center center",
  },
  empty: {
    url: bgEmpty?.url ?? "",
    opacity: 0.16,
    overlay:
      "linear-gradient(180deg, hsl(240 20% 4% / 0.98) 0%, hsl(240 20% 4% / 0.92) 35%, hsl(240 20% 4% / 0.55) 100%)",
    pos: "center bottom",
  },
  pipeline: {
    url: bgEmpty?.url ?? "",
    opacity: 0.07,
    overlay:
      "radial-gradient(ellipse at center, hsl(240 20% 4% / 0.72) 0%, hsl(240 20% 4% / 0.92) 60%, hsl(240 20% 4% / 0.98) 100%)",
    pos: "center bottom",
  },
};

interface Props {
  variant: Variant;
  className?: string;
  /** When false, falls back to flat surface (no image layer at all). */
  enabled?: boolean;
  children?: React.ReactNode;
}

const AtmosphereLayer = ({ variant, className, enabled = true, children }: Props) => {
  const cfg = VARIANTS[variant];
  const hasAsset = enabled && !!cfg.url;

  return (
    <div className={cn("relative isolate", className)}>
      {hasAsset && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-no-repeat bg-cover"
            style={{
              backgroundImage: `url("${cfg.url}")`,
              backgroundPosition: cfg.pos,
              backgroundAttachment: "fixed",
              opacity: cfg.opacity,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ backgroundImage: cfg.overlay }}
          />
        </>
      )}
      {children}
    </div>
  );
};

export default AtmosphereLayer;
