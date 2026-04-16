import { Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryPoint } from "@/types/interpretation";
import { useState } from "react";

interface SummarySectionProps {
  points: SummaryPoint[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAdd: (text: string) => void;
}

const SummarySection = ({ points, onAccept, onReject, onAdd }: SummarySectionProps) => {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const handleAdd = () => {
    if (newText.trim()) {
      onAdd(newText.trim());
      setNewText("");
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-body-lg font-semibold text-foreground">Summary</h3>
      <div className="space-y-2">
        {points.map((point) => (
          <div
            key={point.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-card border transition-all",
              point.status === "pending" && "border-l-[3px] border-l-accent-teal bg-accent-teal/5 border-border",
              point.status === "accepted" && "border-border bg-surface",
              point.status === "rejected" && "border-border bg-surface opacity-40",
            )}
          >
            <p className={cn(
              "flex-1 text-body text-foreground",
              point.status === "rejected" && "line-through",
            )}>
              {point.text}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {point.status === "pending" && (
                <>
                  <button
                    onClick={() => onAccept(point.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-success hover:bg-success/10 transition-colors"
                    title="Accept"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onReject(point.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Reject"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {point.status === "accepted" && (
                <Check className="w-3.5 h-3.5 text-foreground-muted" />
              )}
              {point.status === "rejected" && (
                <button
                  onClick={() => onReject(point.id)}
                  className="text-mono-xs text-foreground-muted hover:text-foreground transition-colors"
                  title="Undo reject"
                >
                  undo
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add a summary point…"
            className="flex-1 h-9 px-3 rounded border border-border bg-surface text-body-sm text-foreground placeholder:text-foreground-muted outline-none focus:border-border-accent"
            autoFocus
          />
          <button onClick={handleAdd} className="text-body-sm text-accent-teal hover:text-accent-teal/80">Add</button>
          <button onClick={() => { setAdding(false); setNewText(""); }} className="text-body-sm text-foreground-muted">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-body-sm text-foreground-muted hover:text-foreground-secondary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add point
        </button>
      )}
    </div>
  );
};

export default SummarySection;
