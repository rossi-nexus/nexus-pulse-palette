// B1-fix3 / Area 2 — Four-action consultant UX for AI-proposed-new ontology items.
//
// Renders the AI's proposed entry (raw_name + target category) with its rich
// metadata from `proposed_category_meta` (description tooltip, keyword chips,
// frequently-paired chips) and four consultant actions:
//   - Map to existing      (default focus; expands MapToExistingPanel)
//   - Accept as new        (inline optional-description form)
//   - Map and propose      (expands MapToExistingPanel; commits both on pick)
//   - Reject               (records a reject decision)
//
// Keyboard: Tab cycles the four buttons in order; Esc closes any expanded panel.
import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapToExistingPanel, type MapToExistingResult } from "./MapToExistingPanel";
import { cn } from "@/lib/utils";

export interface ProposedCategoryMeta {
  id: string;
  normalized_name: string;
  description: string | null;
  keywords: string[];
  example_entries: string[];
  co_occurring: Array<{ id: string; name: string; type: string }>;
}

export interface ProposedNewProposal {
  entry_name: string;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
  source_url?: string | null;
  proposed_category_id: string | null;
  proposed_category_meta: ProposedCategoryMeta | null;
}

interface Props {
  proposal: ProposedNewProposal;
  categoryType: "capability" | "competence" | "domain" | "product_type" | "service_type";
  onMap: (pick: MapToExistingResult) => void;
  onAcceptNew: (description: string | null) => void;
  onMapAndPropose: (pick: MapToExistingResult) => void;
  onReject: () => void;
}

const KEYWORD_CAP = 8;
type Mode = null | "map" | "accept" | "map-and-propose";

export const ProposedNewCard = ({
  proposal,
  categoryType,
  onMap,
  onAcceptNew,
  onMapAndPropose,
  onReject,
}: Props) => {
  const meta = proposal.proposed_category_meta;
  const [mode, setMode] = useState<Mode>(null);
  const [description, setDescription] = useState("");
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const mapBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Default focus on "Map to existing"
    mapBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const keywords = meta?.keywords ?? [];
  const visibleKeywords = showAllKeywords ? keywords : keywords.slice(0, KEYWORD_CAP);
  const overflow = keywords.length - KEYWORD_CAP;
  const coOccurring = meta?.co_occurring ?? [];
  const categoryLabel = meta
    ? `${categoryType.replace("_", " ")} / ${meta.normalized_name}`
    : categoryType.replace("_", " ");

  return (
    <div className="border-l-2 border-accent-teal/60 border-dashed bg-surface/40 rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-mono text-foreground">{proposal.entry_name}</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-teal/15 text-accent-teal">
              AI proposes new
            </span>
          </div>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="mt-0.5 text-[11px] text-foreground-muted uppercase tracking-wider hover:text-foreground focus:text-foreground outline-none"
                  tabIndex={0}
                >
                  {categoryLabel}
                </button>
              </TooltipTrigger>
              {meta?.description && (
                <TooltipContent className="max-w-xs text-xs">
                  {meta.description}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {proposal.evidence && (
            <p className="mt-1 text-xs italic text-foreground-muted">{proposal.evidence}</p>
          )}
        </div>
      </div>

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleKeywords.map((k) => (
            <span
              key={k}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-foreground-muted"
            >
              {k}
            </span>
          ))}
          {!showAllKeywords && overflow > 0 && (
            <button
              type="button"
              onClick={() => setShowAllKeywords(true)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-foreground-muted hover:text-foreground"
            >
              +{overflow} more
            </button>
          )}
        </div>
      )}

      {coOccurring.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Frequently paired with:
          </span>
          {coOccurring.map((c) => (
            <span
              key={c.id}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-foreground-muted"
              title={c.type}
            >
              {c.name}
            </span>
          ))}
        </div>
      )}

      <div className="pt-1 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
            Choose how to handle this AI-proposed entry
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Action guide"
                className="text-foreground-muted hover:text-foreground focus:text-foreground outline-none"
              >
                <HelpCircle className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-80 text-xs space-y-2">
              <p><span className="font-semibold text-foreground">Map to existing</span> — This is already in our ontology under a different name. Link the actor to the existing entry.</p>
              <p><span className="font-semibold text-foreground">Accept as new</span> — This is a real thing we don't have yet. Add it to the ontology (pending admin review) and tag the actor with it.</p>
              <p><span className="font-semibold text-foreground">Map and propose</span> — Link to an existing entry now AND record a new proposal for admin to consider later.</p>
              <p><span className="font-semibold text-foreground">Reject</span> — Not a real thing / not relevant. Discard the proposal.</p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button
          ref={mapBtnRef}
          size="sm"
          variant={mode === "map" ? "default" : "outline"}
          onClick={() => setMode(mode === "map" ? null : "map")}
        >
          Map to existing
        </Button>
        <Button
          size="sm"
          variant={mode === "accept" ? "default" : "outline"}
          onClick={() => setMode(mode === "accept" ? null : "accept")}
          disabled={!proposal.proposed_category_id}
          title={!proposal.proposed_category_id ? "No proposed category" : undefined}
        >
          Accept as new
        </Button>
        <Button
          size="sm"
          variant={mode === "map-and-propose" ? "default" : "outline"}
          onClick={() => setMode(mode === "map-and-propose" ? null : "map-and-propose")}
        >
          Map and propose
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject}>
          Reject
        </Button>
      </div>

      {(mode === "map" || mode === "map-and-propose") && (
        <MapToExistingPanel
          proposedCategoryId={proposal.proposed_category_id}
          coOccurring={coOccurring}
          categoryType={categoryType}
          onPick={(pick) => {
            if (mode === "map") onMap(pick);
            else onMapAndPropose(pick);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}

      {mode === "accept" && (
        <div className={cn("border border-dashed border-border rounded-md p-2 space-y-2 bg-elevated/30")}>
          <Input
            autoFocus
            placeholder="Optional description (leave blank for none)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMode(null);
              if (e.key === "Enter") {
                onAcceptNew(description.trim() || null);
                setDescription("");
                setMode(null);
              }
            }}
            className="h-8 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onAcceptNew(description.trim() || null);
                setDescription("");
                setMode(null);
              }}
            >
              Confirm accept as new
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
