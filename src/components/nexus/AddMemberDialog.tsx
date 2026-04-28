import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ProgrammeRole } from "@/types/programme";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programmeId: string;
  onAdded?: () => void;
}

const AddMemberDialog = ({ open, onOpenChange, programmeId, onAdded }: Props) => {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<ProgrammeRole, "owner">>("consultant");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !email.trim()) return;
    setSubmitting(true);

    const { data: target } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (!target) {
      toast.error("No user found with that email");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("programme_members").insert({
      programme_id: programmeId,
      user_id: target.id,
      role,
      invited_by: user.id,
    });

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEmail("");
    setRole("consultant");
    onOpenChange(false);
    onAdded?.();
    toast.success("Member added");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="consultant">Consultant (can edit own sessions)</SelectItem>
                <SelectItem value="viewer">Viewer (read-only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!email.trim() || submitting}>
            {submitting ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddMemberDialog;
