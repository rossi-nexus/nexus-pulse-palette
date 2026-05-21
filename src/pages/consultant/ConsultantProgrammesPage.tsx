import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, Plus, Users, FileText } from "lucide-react";
import NewProgrammeDialog from "@/components/nexus/NewProgrammeDialog";

const ConsultantProgrammesPage = () => {
  const { programmes, loading, refresh } = useManagedProgrammes();
  const [newOpen, setNewOpen] = useState(false);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted text-sm">
        Loading programmes…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Managed programmes</h1>
            <p className="text-sm text-foreground-secondary mt-1">
              Programmes where you are an owner or consultant.
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New programme
          </Button>
        </div>

        {programmes.length === 0 ? (
          <div className="border border-border rounded-lg bg-elevated p-12 text-center">
            <FolderOpen className="w-10 h-10 mx-auto mb-3 text-foreground-muted" />
            <h2 className="text-base font-medium text-foreground mb-1">No managed programmes</h2>
            <p className="text-sm text-foreground-secondary mb-4">
              Ask a programme owner to add you as a consultant, or create your own programme.
            </p>
            <Button onClick={() => setNewOpen(true)} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Create programme
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {programmes.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/consultant/programmes/${p.id}`)}
                className="text-left border border-border rounded-lg bg-elevated hover:bg-surface/60 transition-colors p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-foreground truncate">
                        {p.name}
                      </h2>
                      <Badge
                        variant={p.status === "active" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {p.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {p.role}
                      </Badge>
                    </div>
                    {p.client_org && (
                      <div className="text-xs text-foreground-muted mt-1">{p.client_org}</div>
                    )}
                  </div>
                </div>
                {p.description && (
                  <p className="text-sm text-foreground-secondary line-clamp-2 mb-3">
                    {p.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-foreground-muted">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {p.member_count} member{p.member_count === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {p.session_count} session{p.session_count === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <NewProgrammeDialog open={newOpen} onOpenChange={setNewOpen} onCreated={refresh} />
    </div>
  );
};

export default ConsultantProgrammesPage;
