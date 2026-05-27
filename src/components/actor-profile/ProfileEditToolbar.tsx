// Profile-4: consolidated edit toolbar for the DB-side actor profile.
// Hoists the `editing` state to ActorProfile.tsx. Holds Edit / Save / Cancel
// (+ optional Re-verify, Merge, Enrich passthroughs). Admin-only Edit button.
//
// Part 2 / Prompt 2: when editing, exposes an optional "Refresh from registry"
// action next to Save / Cancel so the consultant can pull fresh BRREG/CVR/PRH
// values straight into the draft.
import { Loader2, Pencil, Check, X as XIcon, ShieldCheck, Sparkles, GitMerge, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  editing: boolean;
  isAdmin: boolean;
  saving?: boolean;
  hasChanges?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onReverify?: () => void;
  onMerge?: () => void;
  onEnrich?: () => void;
  /** Part 2 / Prompt 2: opens the country-aware registry refresh dialog. */
  onRegistryRefresh?: () => void;
}

export const ProfileEditToolbar = ({
  editing,
  isAdmin,
  saving = false,
  hasChanges = true,
  onEdit,
  onSave,
  onCancel,
  onReverify,
  onMerge,
  onEnrich,
}: Props) => {
  if (!isAdmin) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-muted">
          Read-only — main database actors are managed by administrators.
        </span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !hasChanges}>
          {saving
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
            : <><Check className="w-3.5 h-3.5 mr-1.5" /> Save</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <XIcon className="w-3.5 h-3.5 mr-1.5" /> Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={onEdit}>
        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit profile
      </Button>
      {onReverify && (
        <Button size="sm" variant="outline" onClick={onReverify}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Re-verify
        </Button>
      )}
      <TooltipProvider delayDuration={150}>
        {onMerge ? (
          <Button size="sm" variant="outline" onClick={onMerge}>
            <GitMerge className="w-3.5 h-3.5 mr-1.5" /> Merge
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" variant="outline" disabled>
                  <GitMerge className="w-3.5 h-3.5 mr-1.5" /> Merge
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        )}
        {onEnrich ? (
          <Button size="sm" variant="outline" onClick={onEnrich}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Enrich
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" variant="outline" disabled>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Enrich
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  );
};
