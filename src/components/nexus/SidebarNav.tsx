import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Zap, Database, Settings, ChevronLeft, ChevronRight, Plus,
  FolderPlus, FolderOpen, ChevronDown, MoreVertical, Briefcase, Map as MapIcon, Bookmark, Radio,
} from "lucide-react";
import { useSessionContext, type SessionListItem } from "@/contexts/SessionContext";
import { useProgrammeList } from "@/hooks/useProgramme";
import { useConsultantAccess } from "@/hooks/useConsultantAccess";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import NewProgrammeDialog from "./NewProgrammeDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${d.getFullYear()}`;
  }
  return `${month} ${day}`;
}

const SidebarNav = () => {
  const [expanded, setExpanded] = useState(true);
  const {
    sessions, sessionId, setSessionId, isAdmin, createSession, renameSession,
    assignSessionToProgramme, deleteSession,
  } = useSessionContext();
  const { programmes, refresh: refreshProgrammes } = useProgrammeList();
  const { hasAccess: hasConsultantAccess } = useConsultantAccess();
  const navigate = useNavigate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [newProgOpen, setNewProgOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleNewSession = async () => {
    const id = await createSession();
    if (id) navigate("/pipeline");
  };

  const handleSwitchSession = (id: string) => {
    setSessionId(id);
    navigate("/pipeline");
  };

  const startRename = (id: string, currentName: string | null) => {
    setEditingId(id);
    setDraftName(currentName ?? "");
  };

  const commitRename = async () => {
    if (editingId) {
      const trimmed = draftName.trim();
      if (trimmed) await renameSession(editingId, trimmed);
    }
    setEditingId(null);
  };

  const navItems = [
    { to: "/pipeline", icon: Zap, label: "Pipeline" },
    { to: "/actors", icon: Database, label: "Actors" },
    { to: "/intelligence", icon: Radio, label: "Intelligence" },
    { to: "/saved-searches", icon: Bookmark, label: "Saved searches" },
    { to: "/settings/preferences", icon: Settings, label: "Preferences" },
    ...(isAdmin ? [{ to: "/admin", icon: Settings, label: "Admin" }] : []),
  ];

  const groupedView = programmes.length >= 2;
  // Build session groups: programme_id -> sessions[]; null -> orphan
  const sessionsByProgramme = new Map<string | "none", SessionListItem[]>();
  sessionsByProgramme.set("none", []);
  for (const p of programmes) sessionsByProgramme.set(p.id, []);
  for (const s of sessions) {
    const key = s.programme_id ?? "none";
    if (!sessionsByProgramme.has(key)) sessionsByProgramme.set(key, []);
    sessionsByProgramme.get(key)!.push(s);
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSessionRow = (s: SessionListItem) => {
    const isCurrent = s.id === sessionId;
    const isEditing = editingId === s.id;
    return (
      <div
        key={s.id}
        className={cn(
          "group/session rounded px-2 py-1.5 cursor-pointer transition-colors",
          isCurrent ? "bg-surface" : "hover:bg-surface/50"
        )}
        onClick={() => !isEditing && handleSwitchSession(s.id)}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              isCurrent ? "bg-primary" : "border border-foreground-muted/50"
            )}
          />
          {isEditing ? (
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="bg-background border border-border rounded px-1 py-0.5 text-xs w-full text-foreground focus:outline-none focus:border-primary"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              className={cn(
                "text-xs truncate text-left flex-1 min-w-0",
                isCurrent ? "font-semibold text-foreground" : "text-foreground-secondary"
              )}
              onDoubleClick={(e) => {
                if (isCurrent) {
                  e.stopPropagation();
                  startRename(s.id, s.name);
                }
              }}
              title={isCurrent ? "Double-click to rename" : "Switch to this session"}
            >
              {s.name?.trim() || "Untitled session"}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                className="opacity-0 group-hover/session:opacity-100 text-foreground-muted hover:text-foreground transition-opacity"
                title="Session options"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel className="text-xs">Assign to programme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => assignSessionToProgramme(s.id, null)}
                className="text-xs"
              >
                {s.programme_id === null ? "✓ " : ""}No programme
              </DropdownMenuItem>
              {programmes.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => assignSessionToProgramme(s.id, p.id)}
                  className="text-xs"
                >
                  {s.programme_id === p.id ? "✓ " : ""}{p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmDeleteId(s.id)}
                className="text-xs text-destructive focus:text-destructive"
              >
                Delete session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!isEditing && (
          <div className="text-[10px] text-foreground-muted ml-3.5 mt-0.5">
            {formatSessionDate(s.updated_at)}
          </div>
        )}
      </div>
    );
  };

  if (!expanded) {
    return (
      <aside className="h-full w-8 bg-elevated border-r border-border flex flex-col shrink-0">
        <button
          onClick={() => setExpanded(true)}
          className="h-10 flex items-center justify-center bg-surface/40 text-foreground-secondary hover:bg-surface hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="h-full w-[240px] bg-elevated border-r border-border flex flex-col shrink-0 transition-all duration-200">
        {hasConsultantAccess && (
          <div className="px-2 pt-3 pb-2 border-b border-border">
            <button
              onClick={() => navigate("/consultant/programmes")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-foreground-secondary hover:bg-surface/60 hover:text-foreground transition-colors border border-border"
              title="Switch to consultant workspace"
            >
              <Briefcase className="w-3.5 h-3.5" />
              Switch to consultant workspace
            </button>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.to} className="px-2 mb-1">
                <NavLink
                  to={item.to}
                  end={item.to === "/actors"}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all",
                      "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r",
                      isActive
                        ? "bg-surface text-foreground font-semibold before:bg-accent-teal shadow-sm"
                        : "text-foreground hover:bg-surface/60 before:bg-transparent"
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>

                {/* Map sub-entry under Actors */}
                {item.to === "/actors" && (
                  <NavLink
                    to="/actors/map"
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 ml-6 mt-1 px-2 py-1.5 rounded text-xs transition-colors",
                        isActive
                          ? "bg-surface text-foreground font-semibold"
                          : "text-foreground-secondary hover:bg-surface/50"
                      )
                    }
                  >
                    <MapIcon className="w-3 h-3 shrink-0" />
                    <span>Map</span>
                  </NavLink>
                )}

                {/* Programmes + Sessions appear under Pipeline */}
                {item.to === "/pipeline" && (
                  <div className="mt-3 ml-2 mr-1 space-y-1">
                    {/* Programmes header */}
                    <div className="flex items-center justify-between px-2 mb-1">
                      <span className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-secondary">
                        Programmes
                      </span>
                      <button
                        onClick={() => setNewProgOpen(true)}
                        className="text-foreground-muted hover:text-foreground transition-colors"
                        title="New programme"
                      >
                        <FolderPlus className="w-3 h-3" />
                      </button>
                    </div>

                    {programmes.length === 0 && (
                      <div className="text-[10px] text-foreground-muted italic px-2 mb-2">
                        No programmes yet
                      </div>
                    )}
                    {programmes.map((p) => (
                      <NavLink
                        key={p.id}
                        to={`/consultant/programmes/${p.id}`}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors",
                            isActive
                              ? "bg-surface text-foreground font-semibold"
                              : "text-foreground-secondary hover:bg-surface/50"
                          )
                        }
                      >
                        <FolderOpen className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </NavLink>
                    ))}

                    {/* Sessions */}
                    <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-secondary px-2 mb-1 mt-3">
                      Sessions
                    </div>

                    {groupedView ? (
                      <>
                        {/* No-programme group first */}
                        {(sessionsByProgramme.get("none") ?? []).length > 0 && (
                          <div>
                            <button
                              onClick={() => toggleGroup("none")}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] text-foreground-muted hover:text-foreground transition-colors w-full"
                            >
                              <ChevronDown
                                className={cn(
                                  "w-3 h-3 transition-transform",
                                  collapsedGroups.has("none") && "-rotate-90"
                                )}
                              />
                              No programme
                            </button>
                            {!collapsedGroups.has("none") && (
                              <div className="ml-2 space-y-0.5">
                                {(sessionsByProgramme.get("none") ?? []).map(renderSessionRow)}
                              </div>
                            )}
                          </div>
                        )}
                        {programmes.map((p) => {
                          const list = sessionsByProgramme.get(p.id) ?? [];
                          if (list.length === 0) return null;
                          const collapsed = collapsedGroups.has(p.id);
                          return (
                            <div key={p.id}>
                              <button
                                onClick={() => toggleGroup(p.id)}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] text-foreground-muted hover:text-foreground transition-colors w-full"
                              >
                                <ChevronDown
                                  className={cn(
                                    "w-3 h-3 transition-transform",
                                    collapsed && "-rotate-90"
                                  )}
                                />
                                <span className="truncate">{p.name}</span>
                              </button>
                              {!collapsed && (
                                <div className="ml-2 space-y-0.5">
                                  {list.map(renderSessionRow)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      sessions.map(renderSessionRow)
                    )}

                    <button
                      onClick={handleNewSession}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs font-medium text-accent-teal hover:bg-surface/50 transition-colors mt-1"
                    >
                      <Plus className="w-3 h-3" />
                      New session
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <button
          onClick={() => setExpanded(false)}
          className="h-10 border-t border-border flex items-center justify-center bg-surface/40 text-foreground-secondary hover:bg-surface hover:text-foreground transition-colors shrink-0"
          title="Collapse sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </aside>

      <NewProgrammeDialog
        open={newProgOpen}
        onOpenChange={setNewProgOpen}
        onCreated={refreshProgrammes}
      />

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              All Step 1-5 data for this session will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmDeleteId) return;
                const id = confirmDeleteId;
                setConfirmDeleteId(null);
                const ok = await deleteSession(id);
                if (ok) {
                  toast.success("Session deleted");
                  if (id === sessionId) navigate("/pipeline");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default SidebarNav;
