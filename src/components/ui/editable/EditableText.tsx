// Profile-4: inline-editable text primitive.
// Display mode: plain text (or placeholder). Edit mode: input with save/cancel.
// `editing` is controlled by parent toolbar.
import { useEffect, useRef, useState } from "react";
import { Check, X as XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null | undefined;
  editing: boolean;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  /** Render display value with this transform (e.g. friendly label). */
  display?: (v: string | null | undefined) => React.ReactNode;
}

export const EditableText = ({
  value,
  editing,
  onChange,
  placeholder = "—",
  multiline = false,
  className,
  display,
}: Props) => {
  const [draft, setDraft] = useState<string>(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Sync draft when parent value changes outside of editing
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  if (!editing) {
    const v = (value ?? "").trim();
    return (
      <span className={cn("text-sm text-foreground", className)}>
        {display ? display(value) : v ? v : <span className="text-foreground-muted">{placeholder}</span>}
      </span>
    );
  }

  const commit = () => onChange(draft.trim());
  const revert = () => setDraft(value ?? "");

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      revert();
    }
  };

  return (
    <div className={cn("flex items-start gap-1.5 w-full", className)}>
      {multiline ? (
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          placeholder={placeholder}
          rows={3}
          className="text-sm flex-1"
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          placeholder={placeholder}
          className="h-8 text-sm flex-1"
        />
      )}
      <Button
        type="button" size="sm" variant="ghost" className="h-8 w-8 p-0"
        onMouseDown={(e) => { e.preventDefault(); commit(); }}
        aria-label="Apply"
      >
        <Check className="w-3.5 h-3.5 text-success" />
      </Button>
      <Button
        type="button" size="sm" variant="ghost" className="h-8 w-8 p-0"
        onMouseDown={(e) => { e.preventDefault(); revert(); }}
        aria-label="Revert"
      >
        <XIcon className="w-3.5 h-3.5 text-foreground-muted" />
      </Button>
    </div>
  );
};
