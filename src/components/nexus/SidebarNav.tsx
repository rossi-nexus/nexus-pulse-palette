import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Zap, Database, Settings, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSessionContext } from "@/contexts/SessionContext";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  const [expanded, setExpanded] = useState(false);
  const { sessions, sessionId, setSessionId, isAdmin, createSession, renameSession } = useSessionContext();
  const navigate = useNavigate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
    ...(isAdmin ? [{ to: "/admin", icon: Settings, label: "Admin" }] : []),
  ];

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
      <aside className="h-full w-[220px] bg-elevated border-r border-border flex flex-col shrink-0 transition-all duration-200">
        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.to} className="px-2 mb-1">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-surface text-foreground font-semibold"
                        : "text-foreground hover:bg-surface/60"
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>

                {/* Session list under Pipeline */}
                {item.to === "/pipeline" && (
                  <div className="mt-3 ml-2 mr-1 space-y-1">
                    <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-foreground-secondary px-2 mb-1">
                      Sessions
                    </div>
                    {sessions.map((s) => {
                      const isCurrent = s.id === sessionId;
                      const isEditing = editingId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "group rounded px-2 py-1.5 cursor-pointer transition-colors",
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
                                className="bg-base border border-border rounded px-1 py-0.5 text-xs w-full text-foreground focus:outline-none focus:border-primary"
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
                          </div>
                          {!isEditing && (
                            <div className="text-[10px] text-foreground-muted ml-3.5 mt-0.5">
                              {formatSessionDate(s.updated_at)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={handleNewSession}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-foreground-muted hover:text-foreground hover:bg-surface/50 transition-colors"
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
          className="h-10 border-t border-border flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-surface/50 transition-colors shrink-0"
          title="Collapse"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </aside>
    </TooltipProvider>
  );
};

export default SidebarNav;
