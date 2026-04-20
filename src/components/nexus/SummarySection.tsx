import { Check, X, Plus, Pencil, AlertTriangle, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryPoint, Role } from "@/types/interpretation";
import { useState, useMemo } from "react";

interface SummarySectionProps {
  points: SummaryPoint[];
  roles: Role[];
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAdd: (text: string) => void;
}

const SummarySection = ({ points, roles, onEdit, onDelete, onAdd }: SummarySectionProps) => {
  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) {
      if (r.status !== "rejected") m.set(r.id, r.name);
    }
    return m;
  }, [roles]);

  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());

  const handleAdd = () => {
    if (newText.trim()) {
      onAdd(newText.trim());
      setNewText("");
      setAdding(false);
    }
  };

  const startEdit = (point: SummaryPoint) => {
    setEditingId(point.id);
    setEditText(point.text);
  };

  const confirmEdit = (id: string) => {
    if (editText.trim()) {
      onEdit(id, editText.trim());
      setEditedIds(prev => new Set(prev).add(id));
    }
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  return (
    <div className="space-y-3">
      <h3 className="text-body-lg font-semibold text-foreground">Summary</h3>
      <div className="space-y-2">
        {points.map((point) => {
          const isEditing = editingId === point.id;
          const isEdited = editedIds.has(point.id);
          const isRejected = point.status === "rejected";
          const coveringRoleNames = (point.covered_by_roles ?? [])
            .map((id) => roleNameById.get(id))
            .filter((n): n is string => !!n);
          // Treat undefined the same as [] — manual points get the warning too
          const isUncovered = coveringRoleNames.length === 0;

          return (
            <div
              key={point.id}
              className={cn(
                "px-4 py-3 rounded-card border transition-all bg-surface",
                isEdited && !isRejected ? "border-l-[3px] border-l-accent-teal border-border" : "border-border",
                isRejected && "opacity-50",
              )}
            >
              <div className="flex items-start gap-3">
                {isEditing ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmEdit(point.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 min-h-[60px] px-2 py-1 rounded border border-border-accent bg-background text-body text-foreground outline-none resize-y"
                    autoFocus
                  />
                ) : (
                  <p className={cn("flex-1 text-body text-foreground", isRejected && "line-through")}>
                    {point.text}
                    {isEdited && !isRejected && (
                      <span className="ml-2 text-caption text-accent-teal">edited</span>
                    )}
                  </p>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => confirmEdit(point.id)}
                        className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-success hover:bg-success/10 transition-colors"
                        title="Confirm edit"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Cancel edit"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : isRejected ? (
                    <button
                      onClick={() => onDelete(point.id)}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded text-caption text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
                      title="Restore"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Restore
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(point)}
                        className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(point.id)}
                        className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isEditing && coveringRoleNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-caption text-foreground-muted uppercase tracking-wide">Covered by:</span>
                  {coveringRoleNames.map((name, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-elevated border border-border-subtle text-caption text-foreground-secondary"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {!isEditing && !isRejected && isUncovered && (
                <div className="flex items-center gap-1.5 mt-2 text-caption text-warning">
                  <AlertTriangle className="w-3 h-3" />
                  Not covered by any role
                </div>
              )}
            </div>
          );
        })}
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
