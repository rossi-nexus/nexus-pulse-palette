import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const NewProgrammeDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientOrg, setClientOrg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !name.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("programmes")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        client_org: clientOrg.trim() || null,
        owner_user_id: user.id,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create programme");
      return;
    }
    setName("");
    setDescription("");
    setClientOrg("");
    onOpenChange(false);
    onCreated?.();
    navigate(`/programmes/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New programme</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prog-name">Name</Label>
            <Input
              id="prog-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nordic preparedness 2026"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-desc">Description</Label>
            <Textarea
              id="prog-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prog-org">Client organisation</Label>
            <Input
              id="prog-org"
              value={clientOrg}
              onChange={(e) => setClientOrg(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting ? "Creating…" : "Create programme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewProgrammeDialog;
