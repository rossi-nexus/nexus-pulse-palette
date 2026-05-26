// Profile-4: generic inline-editable list of structured items.
// Caller supplies renderDisplay (read-only row) and renderEdit (editable row).
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props<T> {
  values: T[];
  editing: boolean;
  onChange: (next: T[]) => void;
  /** Factory for a blank item when the user clicks "Add". */
  makeBlank: () => T;
  renderDisplay: (item: T, idx: number) => React.ReactNode;
  renderEdit: (item: T, idx: number, patch: (next: Partial<T>) => void) => React.ReactNode;
  emptyLabel?: string;
  addLabel?: string;
  className?: string;
}

export function EditableItemList<T>({
  values,
  editing,
  onChange,
  makeBlank,
  renderDisplay,
  renderEdit,
  emptyLabel = "—",
  addLabel = "Add",
  className,
}: Props<T>) {
  if (!editing) {
    if (!values.length) {
      return <span className={cn("text-sm text-foreground-muted", className)}>{emptyLabel}</span>;
    }
    return (
      <div className={cn("space-y-1", className)}>
        {values.map((v, i) => (
          <div key={i}>{renderDisplay(v, i)}</div>
        ))}
      </div>
    );
  }

  const patchAt = (idx: number, next: Partial<T>) =>
    onChange(values.map((v, i) => (i === idx ? { ...v, ...next } : v)));
  const removeAt = (idx: number) => onChange(values.filter((_, i) => i !== idx));

  return (
    <div className={cn("space-y-2", className)}>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1">{renderEdit(v, i, (next) => patchAt(i, next))}</div>
          <Button
            type="button" size="sm" variant="ghost"
            onClick={() => removeAt(i)} className="h-8 w-8 p-0"
            aria-label="Remove"
          >
            <Trash2 className="w-3.5 h-3.5 text-foreground-muted" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...values, makeBlank()])}>
        <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}
      </Button>
    </div>
  );
}
