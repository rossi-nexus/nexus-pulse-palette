// AX5 — Small inline help icon with a popover. Used next to axis sliders,
// "Why matched", threshold slider, etc. No external docs site — keep copy inline.
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface HelpHintProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

export const HelpHint = ({ children, className, label = "Help" }: HelpHintProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex items-center justify-center text-foreground-muted hover:text-foreground-secondary transition-colors",
          className,
        )}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" className="max-w-xs text-caption text-foreground-secondary leading-relaxed">
      {children}
    </PopoverContent>
  </Popover>
);

export default HelpHint;
