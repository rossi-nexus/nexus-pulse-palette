// V3 Actor Card Batch A — Unified provenance badge.
// Renders one of 5 trust states (verified / pending / auto / user-asserted / stale)
// next to any value, chip, card, or row that has provenance metadata.
// Hover opens a popover with source label, verifier, date, confidence, evidence,
// and source URL. See Batch A spec §4-6 for state logic and label conventions.
import * as React from "react";
import { CheckCircle2, Clock, Bot, PenLine, AlertTriangle, ExternalLink } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ProvenanceState =
  | "verified"
  | "pending"
  | "auto"
  | "user"
  | "stale"
  | "unknown";

export interface ProvenanceData {
  source?: string | null;
  verified_at?: string | null;
  verifier_id?: string | null;
  verifier_name?: string | null;
  decays_at?: string | null;
  confidence?: string | null;
  evidence?: string | null;
  source_url?: string | null;
  /** Optional caller-supplied registry name (BRREG / CVR / PRH). */
  registry?: string | null;
}

interface Props extends ProvenanceData {
  /** Size variant. "dot" renders a tiny coloured dot (used inside chips). */
  size?: "sm" | "md" | "dot";
  className?: string;
}

const AUTO_SOURCES = new Set([
  "auto",
  "auto_enrichment",
  "auto_scrape",
  "scraped",
  "scraper",
  "registry",
  "pipeline_search",
  "pipeline_analysis",
  "search",
  "ai",
]);

const USER_SOURCES = new Set([
  "manual",
  "user_personal",
  "consultant_draft",
  "user",
]);

export function computeProvenanceState(d: ProvenanceData): ProvenanceState {
  const now = Date.now();
  const verifiedAt = d.verified_at ? new Date(d.verified_at).getTime() : null;
  const decaysAt = d.decays_at ? new Date(d.decays_at).getTime() : null;

  if (verifiedAt && decaysAt && decaysAt < now) return "stale";
  if (verifiedAt || d.verifier_id) return "verified";

  const src = (d.source ?? "").toLowerCase();
  if (src === "consultant_completion") return "verified";
  if (src === "pending" || src === "in_review") return "pending";
  if (USER_SOURCES.has(src)) return "user";
  if (AUTO_SOURCES.has(src)) return "auto";
  if (!src) return "unknown";
  return "auto";
}

interface StateConfig {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  pill: string;
  dot: string;
}

const STATE: Record<ProvenanceState, StateConfig> = {
  verified: {
    label: "Verified",
    Icon: CheckCircle2,
    pill: "bg-success/15 text-success border-success/30",
    dot: "bg-success",
  },
  pending: {
    label: "Pending review",
    Icon: Clock,
    pill: "bg-warning/15 text-warning border-warning/30",
    dot: "bg-warning",
  },
  auto: {
    label: "Auto-extracted",
    Icon: Bot,
    pill: "bg-foreground-muted/10 text-foreground-muted border-foreground-muted/30",
    dot: "bg-foreground-muted",
  },
  user: {
    label: "User-asserted",
    Icon: PenLine,
    pill: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
    dot: "bg-accent-blue",
  },
  stale: {
    label: "Stale",
    Icon: AlertTriangle,
    pill: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  unknown: {
    label: "Source unknown",
    Icon: Bot,
    pill: "bg-foreground-muted/10 text-foreground-muted/70 border-foreground-muted/20",
    dot: "bg-foreground-muted/50",
  },
};

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function hostnameOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function detectRegistry(url?: string | null): string | null {
  const h = hostnameOf(url);
  if (!h) return null;
  if (h.includes("brreg.no")) return "BRREG";
  if (h.includes("cvr.dk") || h.includes("virk.dk")) return "CVR";
  if (h.includes("prh.fi") || h.includes("ytj.fi")) return "PRH";
  return null;
}

/** Source label per Batch A §6 conventions. */
export function formatSourceLabel(d: ProvenanceData): string {
  const src = (d.source ?? "").toLowerCase();
  const date = formatDate(d.verified_at) ?? "";
  const host = hostnameOf(d.source_url);
  const registry = d.registry ?? detectRegistry(d.source_url);

  switch (src) {
    case "auto_enrichment":
      return host ? `Auto-extracted from ${host}` : "Auto-extracted";
    case "auto_scrape":
    case "scraped":
    case "scraper":
      return "Auto-extracted from homepage";
    case "manual":
      return d.verifier_name ? `Added by ${d.verifier_name}` : "Added manually";
    case "consultant_completion":
      return `Verified by ${d.verifier_name ?? "consultant"}${date ? ` on ${date}` : ""}`;
    case "consultant_draft":
      return "Consultant draft";
    case "registry":
      return `From ${registry ?? "registry"}${date ? ` · ${date}` : ""}`;
    case "pipeline_search":
    case "search":
      return `Discovered via pipeline search${date ? ` (${date})` : ""}`;
    case "pipeline_analysis":
      return `From pipeline analysis${date ? ` (${date})` : ""}`;
    case "user_personal":
      return "From your personal collection";
    case "":
    case "unknown":
      return "Source unknown";
    default:
      return host ? `${src} · ${host}` : src;
  }
}

export const ProvenanceBadge: React.FC<Props> = (props) => {
  const { size = "sm", className } = props;
  const state = computeProvenanceState(props);
  const cfg = STATE[state];
  const Icon = cfg.Icon;
  const sourceLabel = formatSourceLabel(props);
  const date = formatDate(props.verified_at);
  const evidence = props.evidence
    ? props.evidence.length > 200
      ? `${props.evidence.slice(0, 200)}…`
      : props.evidence
    : null;

  const trigger =
    size === "dot" ? (
      <button
        type="button"
        aria-label={cfg.label}
        className={cn(
          "inline-block w-2 h-2 rounded-full ring-1 ring-background/60",
          cfg.dot,
          className,
        )}
      />
    ) : (
      <button
        type="button"
        aria-label={cfg.label}
        className={cn(
          "inline-flex items-center gap-1 rounded-sharp border font-medium uppercase tracking-wider",
          cfg.pill,
          size === "md" ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-0.5",
          className,
        )}
      >
        <Icon className={size === "md" ? "w-3 h-3" : "w-2.5 h-2.5"} aria-hidden />
        <span>{cfg.label}</span>
      </button>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 text-xs space-y-2 p-3 bg-elevated border-border"
      >
        <div className="flex items-center gap-1.5">
          <Icon className={cn("w-3.5 h-3.5", cfg.pill.split(" ")[1])} aria-hidden />
          <span className="font-medium text-foreground">{cfg.label}</span>
          {date && <span className="text-foreground-muted">· {date}</span>}
        </div>
        <div className="text-foreground-secondary leading-relaxed">{sourceLabel}</div>
        {props.verifier_name && (
          <div className="text-foreground-muted">
            Verifier: <span className="text-foreground">{props.verifier_name}</span>
          </div>
        )}
        {props.confidence && (
          <div className="text-foreground-muted">
            Confidence:{" "}
            <span className="text-foreground uppercase">{props.confidence}</span>
          </div>
        )}
        {evidence && (
          <p className="text-foreground-muted italic leading-relaxed border-l-2 border-border pl-2">
            "{evidence}"
          </p>
        )}
        {props.source_url && (
          <a
            href={props.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent-teal hover:underline"
          >
            {hostnameOf(props.source_url) ?? "Open source"}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ProvenanceBadge;
