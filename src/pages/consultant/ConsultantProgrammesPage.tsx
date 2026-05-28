import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useManagedProgrammes } from "@/hooks/useManagedProgrammes";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderOpen, Plus, Users, FileText, Trash2 } from "lucide-react";
import NewProgrammeDialog from "@/components/nexus/NewProgrammeDialog";
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

const ConsultantProgrammesPage = () => {
  const { programmes, loading, refresh } = useManagedProgrammes();
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted text-sm">
        Loading programmes…
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("programmes").delete().eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success("Programme deleted");
    setConfirmDelete(null);
    refresh();
  };

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
              <div
                key={p.id}
                className="group relative border border-border rounded-lg bg-elevated hover:bg-surface/60 transition-colors"
              >
                <button
                  onClick={() => navigate(`/consultant/programmes/${p.id}`)}
                  className="w-full text-left p-5 pr-14"
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

                {p.role === "owner" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ id: p.id, name: p.name });
                    }}
                    className="absolute top-3 right-3 p-2 rounded text-foreground-muted opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                    title="Delete programme"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <NewProgrammeDialog open={newOpen} onOpenChange={setNewOpen} onCreated={refresh} />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open && !deleting) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete programme &ldquo;{confirmDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. All sessions, member assignments, and verification events scoped
              to this programme will be unscoped. Closed-loop outcomes recorded against the programme
              will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {deleting ? "Deleting…" : "Delete programme"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ConsultantProgrammesPage;
