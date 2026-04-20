import { useState } from "react";
import { Check, X, ChevronDown, GripVertical, Plus, Pencil, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Role, OntologySelection } from "@/types/interpretation";

interface RolesSectionProps {
  roles: Role[];
  onEdit: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAdd: (name: string) => void;
  onToggleSelection: (roleId: string, entryId: string, categoryType: string) => void;
  onReorder: (orderedIds: string[]) => void;
  populatingRoleIds?: Set<string>;
  populationFailedRoleIds?: Set<string>;
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
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
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
              onClick={(e) => e.stopPropagation()}
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
              {sel.is_proposed_new && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/40 text-warning">
                  New
                </Badge>
              )}
            </label>
          ))}
          {!showAll && !showMore && selections.length > 10 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMore(true); }}
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
  onEdit,
  onDelete,
  onToggleSelection,
  isEdited,
  markEdited,
  isPopulating,
  populationFailed,
}: {
  role: Role;
  onEdit: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleSelection: (roleId: string, entryId: string, categoryType: string) => void;
  isEdited: boolean;
  markEdited: (id: string) => void;
  isPopulating: boolean;
  populationFailed: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(role.name);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(role.name);
    setEditing(true);
  };

  const confirmEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (editName.trim() && editName.trim() !== role.name) {
      onEdit(role.id, editName.trim());
      markEdited(role.id);
    }
    setEditing(false);
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(false);
    setEditName(role.name);
  };

  return (
    <div
      className={cn(
        "border rounded-card transition-all bg-surface",
        isEdited ? "border-l-[3px] border-l-accent-teal border-border" : "border-border",
      )}
    >
      {/* Header — clickable to expand */}
      <div
        onClick={() => !editing && setExpanded(!expanded)}
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
      >
        <GripVertical
          className="w-4 h-4 text-foreground-muted shrink-0 cursor-grab"
          onClick={(e) => e.stopPropagation()}
        />

        {editing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") confirmEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            className="flex-1 h-8 px-2 rounded border border-border-accent bg-background text-body-sm font-medium text-foreground outline-none"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-body-sm font-medium text-foreground inline-flex items-center gap-2">
            {role.name}
            {isEdited && (
              <span className="text-caption text-accent-teal font-normal">edited</span>
            )}
            {isPopulating && (
              <span className="inline-flex items-center gap-1 text-caption text-foreground-muted font-normal">
                <Loader2 className="w-3 h-3 animate-spin" />
                Populating role…
              </span>
            )}
            {populationFailed && !isPopulating && (
              <span className="inline-flex items-center gap-1 text-caption text-warning font-normal" title="Could not auto-populate — role will use name only for search">
                <AlertTriangle className="w-3 h-3" />
                Auto-populate failed
              </span>
            )}
          </span>
        )}

        {editing ? (
          <>
            <button
              onClick={confirmEdit}
              className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-success hover:bg-success/10 transition-colors"
              title="Confirm"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={cancelEdit}
              className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startEdit}
              className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
              title="Edit name"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(role.id); }}
              className="w-7 h-7 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <ChevronDown className={cn("w-4 h-4 text-foreground-muted transition-transform shrink-0", expanded && "rotate-180")} />
          </>
        )}
      </div>

      {/* Expanded content */}
      {expanded && !editing && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-subtle">
          {/* Description */}
          {role.description && (
            <p className="text-body-sm text-foreground-secondary pt-3">
              {role.description}
            </p>
          )}

          {/* Reasoning */}
          {role.reasoning && (
            <p className="text-body-sm text-foreground-muted italic">
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

const RolesSection = ({ roles, onEdit, onDelete, onAdd, onToggleSelection, onReorder, populatingRoleIds, populationFailedRoleIds }: RolesSectionProps) => {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());

  const markEdited = (id: string) => {
    setEditedIds(prev => new Set(prev).add(id));
  };

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName("");
      setAdding(false);
    }
  };

  const handleDragStart = (roleId: string) => setDraggedId(roleId);

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
        {roles.filter(r => r.status !== "rejected").map((role) => (
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
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleSelection={onToggleSelection}
              isEdited={editedIds.has(role.id)}
              markEdited={markEdited}
              isPopulating={populatingRoleIds?.has(role.id) ?? false}
              populationFailed={populationFailedRoleIds?.has(role.id) ?? false}
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
