import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useProgramme } from "@/hooks/useProgramme";
import { useProgrammeAccess } from "@/hooks/useProgrammeAccess";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AddMemberDialog from "@/components/nexus/AddMemberDialog";
import { toast } from "sonner";
import { UserPlus, LogOut, Trash2, ExternalLink, Pencil } from "lucide-react";
import { EditProgrammeDialog } from "@/components/nexus/EditProgrammeDialog";
import ProgrammeAuditLogPanel from "@/components/programme/ProgrammeAuditLogPanel";
import { OutcomeHistoryList } from "@/components/outcome/OutcomeHistoryList";
import { useProgrammeOutcomes } from "@/hooks/useProgrammeOutcomes";
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

const ProgrammeView = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // A4 Area 7 — explicit membership gate (RLS still authoritative).
  const { hasAccess, loading: accessLoading } = useProgrammeAccess(id);
  const { programme, members, sessions, currentUserRole, isOwner, loading, notFound, refresh } =
    useProgramme(id);
  const { outcomes: programmeOutcomes } = useProgrammeOutcomes(programme?.id);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; isSelf: boolean } | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  if (loading || accessLoading) {
    return (
      <div className="h-full flex items-center justify-center text-foreground-muted">
        Loading programme…
      </div>
    );
  }

  // A4 Area 7 — explicit non-member empty state instead of blank data view.
  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8">
        <div className="max-w-md w-full bg-elevated border border-border rounded-lg p-6 text-center space-y-3">
          <h1 className="text-h2 text-foreground">You aren't a member of this programme</h1>
          <p className="text-body-sm text-foreground-secondary">
            Ask a programme owner to invite you, or return to your programme list.
          </p>
          <Link
            to="/consultant/programmes"
            className="inline-block text-accent-teal hover:underline text-body-sm"
          >
            Back to your programmes
          </Link>
        </div>
      </div>
    );
  }

  if (notFound || !programme || currentUserRole === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8">
        <h1 className="text-h1 text-foreground">Programme not found</h1>
        <p className="text-body text-foreground-secondary">
          This programme doesn't exist or has been removed.
        </p>
        <Link to="/consultant/programmes" className="text-accent-teal hover:underline">
          Back to your programmes
        </Link>
      </div>
    );
  }

  const handleRemoveMember = async () => {
    if (!confirmRemove) return;
    setRemovingMember(true);
    try {
      const { error } = await supabase
        .from("programme_members")
        .delete()
        .eq("programme_id", programme.id)
        .eq("user_id", confirmRemove.userId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(confirmRemove.isSelf ? "Left programme" : "Member removed");
      setConfirmRemove(null);
      refresh();
    } finally {
      setRemovingMember(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1 min-w-0">
              <h1 className="text-[2.125rem] font-light tracking-[0.03em] leading-[1.2] text-foreground">
                {programme.name}
              </h1>
              {programme.description && (
                <p className="text-body text-foreground-secondary">{programme.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {programme.client_org && (
                  <Badge variant="secondary">{programme.client_org}</Badge>
                )}
                <Badge variant={programme.status === "active" ? "default" : "outline"}>
                  {programme.status}
                </Badge>
                <Badge variant="outline">Your role: {currentUserRole}</Badge>
              </div>
            </div>
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
        </header>

        {/* Members */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-h2 text-foreground">Members</h2>
            {isOwner && (
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" />
                Add member
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            {members.map((m) => {
              const isSelf = m.user_id === user?.id;
              const canRemoveOther = isOwner && !isSelf;
              const canSelfLeave = isSelf && m.role !== "owner";
              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-body text-foreground truncate">
                      {m.user_name || m.user_email || m.user_id}
                    </span>
                    <span className="text-body-sm text-foreground-muted truncate">{m.user_email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role === "owner" ? "default" : "outline"}>{m.role}</Badge>
                    {canRemoveOther && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemove({ userId: m.user_id, isSelf: false })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                    {canSelfLeave && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemove({ userId: m.user_id, isSelf: true })}
                      >
                        <LogOut className="w-4 h-4 mr-1" />
                        Leave
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sessions */}
        <section className="space-y-3">
          <h2 className="text-h2 text-foreground">Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-body-sm text-foreground-muted italic">
              No sessions assigned to this programme yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((s) => (
                <Link
                  key={s.id}
                  to="/pipeline"
                  onClick={() => {
                    // Hint: SessionContext picks current via initial load; user can switch via sidebar.
                  }}
                  className="flex items-center justify-between bg-surface hover:bg-elevated border border-border rounded-md px-3 py-2 transition-colors"
                >
                  <span className="text-body text-foreground truncate">
                    {s.name?.trim() || "Untitled session"}
                  </span>
                  <ExternalLink className="w-4 h-4 text-foreground-muted" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Activity log — visible to all programme members */}
        <ProgrammeAuditLogPanel programmeId={programme.id} />

        {/* Phase 6.5.6: Outcomes section */}
        <section className="space-y-3">
          <div>
            <h2 className="text-h2 text-foreground">Outcomes</h2>
            <p className="text-body-sm text-foreground-muted">
              Real-world results for actors recommended on this programme.
            </p>
          </div>
          <OutcomeHistoryList
            outcomes={programmeOutcomes}
            variant="programme"
            emptyState="No outcomes recorded yet."
          />
        </section>
      </div>

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        programmeId={programme.id}
        onAdded={refresh}
      />

      <EditProgrammeDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        programme={programme}
        onSaved={refresh}
      />

      <AlertDialog open={confirmRemove !== null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRemove?.isSelf ? "Leave programme?" : "Remove member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.isSelf
                ? "You will lose access to this programme and its sessions."
                : "This member will lose access to the programme and its sessions."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingMember}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemoveMember();
              }}
              disabled={removingMember}
            >
              {removingMember
                ? (confirmRemove?.isSelf ? "Leaving…" : "Removing…")
                : (confirmRemove?.isSelf ? "Leave" : "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProgrammeView;
