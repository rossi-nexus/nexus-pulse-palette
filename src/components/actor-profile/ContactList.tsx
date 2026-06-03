// V3 Batch B item 5 — curated contact list for an actor.
// Featured rows first (up to 6) in a richer card; the rest collapsed below.
// Hover actions per row: star (feature), eye (hide), pencil (edit), trash (delete).
// Hidden rows only render behind an admin-only toggle.
import { useMemo, useState } from "react";
import {
  Star,
  StarOff,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Linkedin,
  Plus,
  Check,
  X as XIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProvenanceBadge } from "@/components/actor-profile/ProvenanceBadge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ContactRow {
  id: string;
  actor_id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;       // legacy column
  linkedin_url?: string | null;   // canonical full URL (Batch B addition)
  notes?: string | null;
  source: string;
  is_featured?: boolean | null;
  is_hidden?: boolean | null;
  verifier_id?: string | null;
  verified_at?: string | null;
  decays_at?: string | null;
  verifier_confidence?: string | null;
}

const FEATURED_CAP = 6;
const UNFEATURED_CAP = 6;

interface Props {
  actorId: string;
  contacts: ContactRow[];
  canEdit: boolean;
  /** Hidden-rows toggle is admin-only per spec. */
  isAdmin: boolean;
  onChange: (next: ContactRow[]) => void;
}

interface EditDraft {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin_url: string;
  notes: string;
}

function emptyDraft(c?: Partial<ContactRow>): EditDraft {
  return {
    name: c?.name ?? "",
    title: c?.title ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    linkedin_url: c?.linkedin_url ?? c?.linkedin ?? "",
    notes: c?.notes ?? "",
  };
}

function preferredLinkedIn(c: ContactRow): string | null {
  const v = (c.linkedin_url ?? c.linkedin ?? "").trim();
  return v.length > 0 ? v : null;
}

export function ContactList({ actorId, contacts, canEdit, isAdmin, onChange }: Props) {
  const { user } = useAuth();
  const [showHidden, setShowHidden] = useState(false);
  const [showAllUnfeatured, setShowAllUnfeatured] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(emptyDraft());
  const [savingId, setSavingId] = useState<string | null>(null);

  const { featured, unfeatured, hidden } = useMemo(() => {
    const f: ContactRow[] = [];
    const u: ContactRow[] = [];
    const h: ContactRow[] = [];
    for (const c of contacts) {
      if (c.is_hidden) h.push(c);
      else if (c.is_featured) f.push(c);
      else u.push(c);
    }
    return { featured: f.slice(0, FEATURED_CAP), unfeatured: u, hidden: h };
  }, [contacts]);

  const replaceRow = (next: ContactRow) => {
    onChange(contacts.map((c) => (c.id === next.id ? { ...c, ...next } : c)));
  };

  const removeRow = (id: string) => {
    onChange(contacts.filter((c) => c.id !== id));
  };

  const insertRow = (row: ContactRow) => {
    onChange([row, ...contacts]);
  };

  async function toggleFeatured(c: ContactRow) {
    const next = !c.is_featured;
    const { error } = await supabase
      .from("actor_contacts")
      .update({ is_featured: next, is_hidden: next ? false : c.is_hidden ?? false })
      .eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    replaceRow({ ...c, is_featured: next, is_hidden: next ? false : c.is_hidden ?? false });
  }

  async function toggleHidden(c: ContactRow) {
    const next = !c.is_hidden;
    const { error } = await supabase
      .from("actor_contacts")
      .update({ is_hidden: next, is_featured: next ? false : c.is_featured ?? false })
      .eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    replaceRow({ ...c, is_hidden: next, is_featured: next ? false : c.is_featured ?? false });
  }

  async function deleteRow(c: ContactRow) {
    if (!window.confirm(`Delete contact ${c.name}?`)) return;
    const { error } = await supabase.from("actor_contacts").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    removeRow(c.id);
    toast.success("Contact deleted");
  }

  function beginEdit(c: ContactRow) {
    setAddingNew(false);
    setEditingId(c.id);
    setDraft(emptyDraft(c));
  }

  function beginAdd() {
    setEditingId(null);
    setAddingNew(true);
    setDraft(emptyDraft());
  }

  function cancelEdit() {
    setEditingId(null);
    setAddingNew(false);
    setDraft(emptyDraft());
  }

  async function saveEdit() {
    if (!draft.name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      name: draft.name.trim(),
      title: draft.title.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      linkedin_url: draft.linkedin_url.trim() || null,
      notes: draft.notes.trim() || null,
    };

    if (addingNew) {
      setSavingId("__new__");
      const { data, error } = await supabase
        .from("actor_contacts")
        .insert({
          actor_id: actorId,
          ...payload,
          source: "manual",
          verifier_id: user?.id ?? null,
          verified_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      setSavingId(null);
      if (error || !data) { toast.error(error?.message ?? "Insert failed"); return; }
      insertRow(data as ContactRow);
      cancelEdit();
      toast.success("Contact added");
      return;
    }

    if (!editingId) return;
    setSavingId(editingId);
    const { data, error } = await supabase
      .from("actor_contacts")
      .update({
        ...payload,
        verifier_id: user?.id ?? null,
        verified_at: new Date().toISOString(),
      })
      .eq("id", editingId)
      .select("*")
      .single();
    setSavingId(null);
    if (error || !data) { toast.error(error?.message ?? "Update failed"); return; }
    replaceRow(data as ContactRow);
    cancelEdit();
    toast.success("Contact updated");
  }

  function ContactCard({ c, compact }: { c: ContactRow; compact?: boolean }) {
    const linkedin = preferredLinkedIn(c);
    const isEditing = editingId === c.id;
    if (isEditing) return <EditForm onCancel={cancelEdit} onSave={saveEdit} saving={savingId === c.id} draft={draft} setDraft={setDraft} />;
    return (
      <div className={cn(
        "group bg-surface border border-border/60 rounded-md text-sm relative",
        compact ? "p-2 px-3" : "p-3",
      )}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-medium text-foreground truncate">{c.name}</div>
              {!compact && (
                <ProvenanceBadge
                  source={c.source}
                  verified_at={c.verified_at}
                  verifier_id={c.verifier_id}
                  decays_at={c.decays_at}
                  confidence={c.verifier_confidence}
                />
              )}
              {c.is_featured && !compact && (
                <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                  <Star className="w-3 h-3 fill-warning" /> Featured
                </span>
              )}
            </div>
            {c.title && (
              <div className="text-xs text-foreground-secondary truncate">{c.title}</div>
            )}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-foreground-secondary">
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  aria-label="Email"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[200px]">{c.email}</span>
                </a>
              )}
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  aria-label="Phone"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {c.phone}
                </a>
              )}
              {linkedin && (
                <a
                  href={linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent-teal hover:underline"
                  aria-label="LinkedIn profile"
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </a>
              )}
            </div>
            {c.notes && !compact && (
              <div className="text-xs text-foreground-muted mt-2 whitespace-pre-wrap">{c.notes}</div>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => toggleFeatured(c)}
                title={c.is_featured ? "Unfeature" : "Feature"}
              >
                {c.is_featured ? <StarOff className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => toggleHidden(c)}
                title={c.is_hidden ? "Unhide" : "Hide"}
              >
                {c.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => beginEdit(c)}
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => deleteRow(c)}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const unfeaturedToShow = showAllUnfeatured ? unfeatured : unfeatured.slice(0, UNFEATURED_CAP);
  const remainingUnfeatured = unfeatured.length - UNFEATURED_CAP;

  return (
    <div className="space-y-3">
      {/* Add-new form takes its own slot at the top when active */}
      {addingNew && (
        <EditForm onCancel={cancelEdit} onSave={saveEdit} saving={savingId === "__new__"} draft={draft} setDraft={setDraft} />
      )}

      {contacts.length === 0 && !addingNew && (
        <div className="text-xs text-foreground-secondary">
          No contacts yet. Use "Scan team page" to auto-extract from the website, or add manually.
        </div>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <div className="space-y-2">
          {featured.map((c) => <ContactCard key={c.id} c={c} />)}
        </div>
      )}

      {/* Unfeatured (compact) */}
      {unfeatured.length > 0 && (
        <div className="space-y-1.5">
          {featured.length > 0 && (
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted mt-1">
              Other contacts
            </div>
          )}
          {unfeaturedToShow.map((c) => <ContactCard key={c.id} c={c} compact />)}
          {!showAllUnfeatured && remainingUnfeatured > 0 && (
            <button
              type="button"
              className="text-xs text-accent-teal hover:underline"
              onClick={() => setShowAllUnfeatured(true)}
            >
              Show all {unfeatured.length} contacts
            </button>
          )}
          {showAllUnfeatured && unfeatured.length > UNFEATURED_CAP && (
            <button
              type="button"
              className="text-xs text-foreground-muted hover:text-foreground"
              onClick={() => setShowAllUnfeatured(false)}
            >
              Show fewer
            </button>
          )}
        </div>
      )}

      {/* Hidden — admin only */}
      {isAdmin && hidden.length > 0 && (
        <div>
          <button
            type="button"
            className="text-xs text-foreground-muted hover:text-foreground inline-flex items-center gap-1"
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showHidden ? "Hide" : "Show"} {hidden.length} hidden contact{hidden.length === 1 ? "" : "s"}
          </button>
          {showHidden && (
            <div className="space-y-1.5 mt-2 opacity-60">
              {hidden.map((c) => <ContactCard key={c.id} c={c} compact />)}
            </div>
          )}
        </div>
      )}

      {/* Add button */}
      {canEdit && !addingNew && (
        <Button size="sm" variant="outline" onClick={beginAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add contact
        </Button>
      )}
    </div>
  );
}

function EditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: EditDraft;
  setDraft: (d: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-elevated border border-border rounded-md p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          placeholder="Name *"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          autoFocus
        />
        <Input
          placeholder="Title / role"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <Input
          placeholder="Email"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
        />
        <Input
          placeholder="Phone"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
        />
        <Input
          placeholder="LinkedIn URL"
          value={draft.linkedin_url}
          onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })}
          className="sm:col-span-2"
        />
      </div>
      <Textarea
        placeholder="Notes (optional)"
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        className="min-h-[60px]"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !draft.name.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <XIcon className="w-3.5 h-3.5 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}
