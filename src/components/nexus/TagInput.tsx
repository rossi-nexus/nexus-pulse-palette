import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  renderTag?: (tag: string) => string;
  className?: string;
}

/**
 * Small chip input. Enter or comma adds the current value.
 * Backspace on empty input removes the last tag.
 * Used by Step 2 constraints and the Actor Profile tags section.
 */
export const TagInput = ({
  tags,
  onChange,
  placeholder,
  renderTag,
  className,
}: TagInputProps) => {
  const [input, setInput] = useState("");

  const handleAdd = (raw: string) => {
    const val = raw.trim().replace(/,$/, "").trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAdd(input);
      return;
    }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="text-xs gap-1 px-2 py-0.5">
          {renderTag ? renderTag(tag) : tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="hover:text-destructive"
            aria-label={`Remove ${tag}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </Badge>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-7 px-2 min-w-[120px] flex-1 bg-transparent text-body-sm text-foreground placeholder:text-foreground-muted outline-none"
      />
    </div>
  );
};
