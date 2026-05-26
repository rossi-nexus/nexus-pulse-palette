// Profile-4: inline-editable string-tag list primitive.
// Display: chip list. Edit: input + remove + add.
import { useState } from "react";
import { Plus, X as XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  values: string[];
  editing: boolean;
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

export const EditableTagList = ({
  values,
  editing,
  onChange,
  placeholder = "Add and press Enter",
  emptyLabel = "—",
  className,
}: Props) => {
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const t = draft.trim();
    if (!t) return;
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, t]);
    setDraft("");
  };
  const removeTag = (idx: number) => onChange(values.filter((_, i) => i !== idx));

  if (!editing) {
    if (!values.length) {
      return <span className={cn("text-sm text-foreground-muted", className)}>{emptyLabel}</span>;
    }
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-surface border border-border/60 text-foreground"
          >
            {v}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-elevated border border-border text-foreground"
          >
            {v}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="text-foreground-muted hover:text-destructive"
              aria-label={`Remove ${v}`}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addTag(); }
          }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={addTag} disabled={!draft.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
