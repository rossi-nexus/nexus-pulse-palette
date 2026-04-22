import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UnlockConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names of downstream steps that will be cleared, e.g. ["Search", "Deep Analysis"] */
  downstreamStepNames: string[];
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown before unlocking a step that has downstream data.
 * Lists the downstream steps that will be cleared and requires explicit confirmation.
 */
const UnlockConfirmDialog = ({
  open,
  onOpenChange,
  downstreamStepNames,
  onConfirm,
}: UnlockConfirmDialogProps) => {
  const list =
    downstreamStepNames.length === 0
      ? ""
      : downstreamStepNames.length === 1
        ? downstreamStepNames[0]
        : downstreamStepNames.length === 2
          ? `${downstreamStepNames[0]} and ${downstreamStepNames[1]}`
          : `${downstreamStepNames.slice(0, -1).join(", ")}, and ${downstreamStepNames[downstreamStepNames.length - 1]}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Unlock this step?</DialogTitle>
          <DialogDescription className="text-foreground-secondary">
            Unlocking will reset all downstream steps. {list} will be cleared. You will
            need to re-run them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnlockConfirmDialog;
