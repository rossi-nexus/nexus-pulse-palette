import { useState } from "react";
import { Check, X, ChevronDown, GripVertical, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Role, OntologySelection } from "@/types/interpretation";

interface RolesSectionProps {
  roles: Role[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAdd: (name: string) => void;
  onToggleSelection: (roleId: string, entryId: string, categoryType: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  capabilities: "Capabilities",
  competences: "Competences",
  domains: "Domains",
  productTypes: "Product Types",
  serviceTypes: "Service Types",
};

const OntologyCategory = ({
  label,
  selections,
  roleId,
  onToggle,
}: {
  label: string;
  selections: OntologySelection[];
  roleId: string;
  onToggle: (roleId: string, entryId: string, categoryType: string) => void;
}) => {
  const selected = selections.filter(s => s.selected);
  const [expanded, setExpanded] = useState(selected.length > 0);
  const [showMore, setShowMore] = useState(false);

  if (selections.length === 0) return null;

  // Sort: selected first, then unselected
  const sorted = [...selections].sort((a, b) => {
    if (a.selected && !b.selected) return -1;
    if (!a.selected && b.selected) return 1;
    return 0;
  });

  const showAll = selections.length <= 15;
  const displayed = showAll || showMore ? sorted : sorted.slice(0, 10);

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-body-sm font-medium text-foreground-secondary hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
        {label} ({selected.length} selected)
      </button>
      {expanded && (
        <div className={cn("ml-5 space-y-1", selections.length > 15 && "max-h-[200px] overflow-y-auto")}>
          {displayed.map((sel) => (
            <label
              key={sel.id}
              className="flex items-center gap-2 py-0.5 cursor-pointer group"
            >
              <Checkbox
                checked={sel.selected}
                onCheckedChange={() => onToggle(roleId, sel.entryId, sel.categoryType)}
                className="w-3.5 h-3.5"
              />
              <span className={cn(
                "text-body-sm",
                sel.selected ? "text-foreground" : "text-foreground-muted",
              )}>
                {sel.rawName}
              </span>
              {sel.selected && sel.source === "axis" && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-accent-teal/40 text-accent-teal">
                  Axis
                </Badge>
              )}
              {sel.is_proposed_new && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/40 text-warning">
                  New
                </Badge>
              )}
            </label>
          ))}
          {!showAll && !showMore && selections.length > 10 && (
            <button
              onClick={() => setShowMore(true)}
              className="text-caption text-foreground-muted hover:text-foreground-secondary transition-colors ml-5"
            >
              Show all {selections.length} entries
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const RoleCard = ({
  role,
  onAccept,
  onReject,
  onToggleSelection,
}: {
  role: Role;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onToggleSelection: (roleId: string, entryId: string, categoryType: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "border rounded-card transition-all",
        role.status === "pending" && "border-l-[3px] border-l-accent-teal border-border bg-surface",
        role.status === "accepted" && "border-border bg-surface",
        role.status === "rejected" && "border-border bg-surface opacity-40",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <GripVertical className="w-4 h-4 text-foreground-muted shrink-0 cursor-grab" />
        <span className={cn(
          "flex-1 text-body-sm font-medium",
          role.status === "rejected" ? "line-through text-foreground-muted" : "text-foreground",
        )}>
          {role.name}
        </span>

        {role.source === "axis" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-accent-teal/40 text-accent-teal">
            Axis
          </Badge>
        )}

        {role.status === "pending" && (
          <>
            <button
              onClick={() => onAccept(role.id)}
              className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-success hover:bg-success/10 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReject(role.id)}
              className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {role.status === "accepted" && (
          <Check className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
        )}
        {role.status === "rejected" && (
          <button
            onClick={() => onReject(role.id)}
            className="text-mono-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            undo
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-subtle">
          {/* Reasoning */}
          {role.reasoning && (
            <p className="text-body-sm text-foreground-secondary italic pt-3">
              {role.reasoning}
            </p>
          )}

          {/* Ontology targets */}
          <div className="space-y-3 pt-2">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <OntologyCategory
                key={key}
                label={label}
                selections={role.targets[key as keyof typeof role.targets] || []}
                roleId={role.id}
                onToggle={onToggleSelection}
              />
            ))}
          </div>

          {/* Dependencies */}
          {role.dependencies.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border-subtle">
              {role.dependencies.map((dep) => (
                <p key={dep.id} className="text-body-sm text-foreground-secondary">
                  <span className="text-foreground-muted">Depends on:</span>{" "}
                  <span className="font-medium">{dep.depends_on_role_name}</span>{" "}
                  — {dep.description}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RolesSection = ({ roles, onAccept, onReject, onAdd, onToggleSelection, onReorder }: RolesSectionProps) => {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName("");
      setAdding(false);
    }
  };

  const handleDragStart = (roleId: string) => {
    setDraggedId(roleId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const ids = roles.map(r => r.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, draggedId);
    onReorder(newIds);
  };

  const handleDragEnd = () => setDraggedId(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-body-lg font-semibold text-foreground">Roles</h3>
        <Badge variant="secondary" className="text-mono-xs">
          {roles.length} roles
        </Badge>
      </div>

      <div className="space-y-2">
        {roles.map((role) => (
          <div
            key={role.id}
            draggable
            onDragStart={() => handleDragStart(role.id)}
            onDragOver={(e) => handleDragOver(e, role.id)}
            onDragEnd={handleDragEnd}
            className={cn(draggedId === role.id && "opacity-50")}
          >
            <RoleCard
              role={role}
              onAccept={onAccept}
              onReject={onReject}
              onToggleSelection={onToggleSelection}
            />
          </div>
        ))}
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Role name…"
            className="flex-1 h-9 px-3 rounded border border-border bg-surface text-body-sm text-foreground placeholder:text-foreground-muted outline-none focus:border-border-accent"
            autoFocus
          />
          <button onClick={handleAdd} className="text-body-sm text-accent-teal">Add</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="text-body-sm text-foreground-muted">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-body-sm text-foreground-muted hover:text-foreground-secondary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add role
        </button>
      )}
    </div>
  );
};

export default RolesSection;
