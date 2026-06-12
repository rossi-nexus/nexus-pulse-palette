// VR-01 — Atmospheric full-bleed background wrapper.
// Default OFF — pass `image` to opt-in. If the import resolves to a missing
// asset, browsers will just leave the background blank (the dark overlay still
// fills) — no broken-image icon and no layout shift.
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  image?: string | null;
  variant?: "hero" | "empty";
  className?: string;
  children: ReactNode;
}

export const AtmosphereBackground = ({
  image,
  variant = "hero",
  className,
  children,
}: Props) => {
  const style = image
    ? ({ ["--atmo-image" as any]: `url(${image})` } as CSSProperties)
    : undefined;

  return (
    <div
      className={cn(
        "atmo-layer",
        variant === "empty" && "atmo-empty",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
};

export default AtmosphereBackground;
