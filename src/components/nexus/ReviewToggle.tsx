import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReviewToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Small button shown next to the Unlock button on locked steps.
 * Toggles a read-only "Review" view of the step's full content.
 */
const ReviewToggle = ({ expanded, onToggle }: ReviewToggleProps) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onToggle}
    className="gap-1.5 text-foreground-muted hover:text-foreground h-8"
    title={expanded ? "Collapse review" : "Expand to review locked content"}
  >
    {expanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
    {expanded ? "Collapse" : "Review"}
  </Button>
);

export default ReviewToggle;
