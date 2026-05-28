import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, X, UserMinus, Pencil } from "lucide-react";

interface AttrRow {
  key: string;
  value: string | null;
  expires_at: string | null;
}
interface ProgRow {
  programme_id: string;
  name: string;
  role: string;
}
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  deactivated_at: string | null;
  created_at: string;
  attributes: AttrRow[];
  programmes: ProgRow[];
}
interface Programme {
  id: string;
  name: string;
}

const ATTRIBUTE_PRESETS = [
  { key: "role", value: "consultant", label: "Consultant" },
  { key: "actors:visibility", value: "all", label: "Full actor visibility" },
];

const UserManagementPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [u, p] = await Promise.all([
      supabase.rpc("fn_admin_list_users"),
      supabase.from("programmes").select("id, name").order("name"),
    ]);
    if (u.error) toast.error(u.error.message);
    else setUsers((u.data ?? []) as unknown as UserRow[]);
    if (!p.error) setProgrammes((p.data ?? []) as Programme[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deactivate = async (id: string) => {
    if (!confirm("Deactivate this user? They will be hidden from pickers.")) return;
    const { error } = await supabase.rpc("fn_admin_deactivate_user", { p_user_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("User deactivated");
      void load();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-h1 text-foreground">User management</h1>
            <p className="text-body-sm text-foreground-muted mt-1">
              Manage admins, attributes and programme memberships.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add user
          </Button>
        </div>

        {loading ? (
          <div className="text-foreground-muted">Loading…</div>
        ) : (
          <div className="bg-surface border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-elevated text-foreground-muted">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Attributes</th>
                  <th className="px-4 py-2 font-medium">Programmes</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const progs = u.programmes ?? [];
                  const visible = progs.slice(0, 3);
                  const rest = progs.length - visible.length;
                  return (
                    <tr
                      key={u.id}
                      className={`border-t border-border hover:bg-elevated/40 ${u.deactivated_at ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{u.email}</td>
                      <td className="px-4 py-2 text-foreground">{u.name}</td>
                      <td className="px-4 py-2">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(u.attributes ?? []).map((a) => (
                            <Badge key={`${a.key}-${a.value}`} variant="outline" className="text-[10px]">
                              {a.key}={a.value}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {visible.map((p) => (
                            <Badge key={p.programme_id} variant="outline" className="text-[10px]">
                              {p.name}
                            </Badge>
                          ))}
                          {rest > 0 && (
                            <span className="text-foreground-muted text-xs">and {rest} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-foreground-muted text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditUser(u)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {!u.deactivated_at && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deactivate(u.id)}
                              title="Deactivate"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        programmes={programmes}
        onCreated={() => {
          setAddOpen(false);
          void load();
        }}
      />

      <EditUserSheet
        user={editUser}
        programmes={programmes}
        onClose={() => setEditUser(null)}
        onChanged={() => {
          void load();
        }}
      />
    </div>
  );
};

const AddUserDialog = ({
  open,
  onOpenChange,
  programmes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  programmes: Programme[];
  onCreated: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [attrs, setAttrs] = useState<Record<string, boolean>>({});
  const [progIds, setProgIds] = useState<string[]>([]);
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setRole("user");
    setAttrs({});
    setProgIds([]);
    setInvite(true);
  };

  const submit = async () => {
    if (!email) return;
    setBusy(true);
    const selectedAttrs = ATTRIBUTE_PRESETS.filter((p) => attrs[`${p.key}=${p.value}`]).map(
      (p) => ({ key: p.key, value: p.value }),
    );
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email,
        name: name || undefined,
        role,
        attributes: selectedAttrs,
        programme_ids: progIds,
        send_invite: invite,
      },
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error(error?.message ?? (data as { error?: string })?.error ?? "Failed");
      return;
    }
    toast.success(invite ? "Invitation sent" : "User created");
    reset();
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Email *</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Initial role</Label>
            <RadioGroup
              value={role}
              onValueChange={(v) => setRole(v as "user" | "admin")}
              className="flex gap-4 mt-1"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="user" /> User
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="admin" /> Admin
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label>ABAC attributes</Label>
            <div className="space-y-2 mt-1">
              {ATTRIBUTE_PRESETS.map((p) => {
                const k = `${p.key}=${p.value}`;
                return (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!attrs[k]}
                      onCheckedChange={(c) => setAttrs((a) => ({ ...a, [k]: !!c }))}
                    />
                    <span className="font-mono text-xs">{k}</span>
                    <span className="text-foreground-muted">— {p.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Programme memberships</Label>
            <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 mt-1 space-y-1">
              {programmes.length === 0 && (
                <div className="text-xs text-foreground-muted">No programmes yet.</div>
              )}
              {programmes.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={progIds.includes(p.id)}
                    onCheckedChange={(c) =>
                      setProgIds((ids) =>
                        c ? [...ids, p.id] : ids.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Send invite email</Label>
            <Switch checked={invite} onCheckedChange={setInvite} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!email || busy} onClick={submit}>
            {busy ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EditUserSheet = ({
  user,
  programmes,
  onClose,
  onChanged,
}: {
  user: UserRow | null;
  programmes: Programme[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [newAttrKey, setNewAttrKey] = useState("");
  const [newAttrVal, setNewAttrVal] = useState("");
  const [progPick, setProgPick] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setRole((user.role as "user" | "admin") ?? "user");
    }
  }, [user]);

  if (!user) return null;

  const saveCore = async () => {
    const { error } = await supabase.rpc("fn_admin_update_user", {
      p_user_id: user.id,
      p_name: name,
      p_role: role,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      onChanged();
    }
  };

  const addAttr = async (key: string, value: string) => {
    if (!key) return;
    const { error } = await supabase.rpc("fn_admin_set_user_attribute", {
      p_user_id: user.id,
      p_key: key,
      p_value: value,
      p_expires_at: null,
    });
    if (error) toast.error(error.message);
    else {
      setNewAttrKey("");
      setNewAttrVal("");
      onChanged();
    }
  };

  const removeAttr = async (key: string, value: string | null) => {
    const { error } = await supabase.rpc("fn_admin_remove_user_attribute", {
      p_user_id: user.id,
      p_key: key,
      p_value: value ?? "",
    });
    if (error) toast.error(error.message);
    else onChanged();
  };

  const addProgramme = async (programme_id: string) => {
    if (!programme_id) return;
    const { error } = await supabase
      .from("programme_members")
      .insert({ programme_id, user_id: user.id, role: "member" });
    if (error) toast.error(error.message);
    else {
      setProgPick("");
      onChanged();
    }
  };

  const removeProgramme = async (programme_id: string) => {
    const { error } = await supabase
      .from("programme_members")
      .delete()
      .eq("programme_id", programme_id)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else onChanged();
  };

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit user</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-6">
          <div className="text-xs font-mono text-foreground-muted">{user.email}</div>

          <div className="space-y-3">
            <div>
              <Label>Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as "user" | "admin")}
                className="flex gap-4 mt-1"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="user" /> User
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="admin" /> Admin
                </label>
              </RadioGroup>
            </div>
            <Button size="sm" onClick={saveCore}>
              Save
            </Button>
          </div>

          <div>
            <Label>ABAC attributes</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(user.attributes ?? []).map((a) => (
                <Badge
                  key={`${a.key}-${a.value}`}
                  variant="outline"
                  className="flex items-center gap-1"
                >
                  <span className="font-mono text-[10px]">
                    {a.key}={a.value}
                  </span>
                  <button
                    onClick={() => removeAttr(a.key, a.value)}
                    className="hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <div className="text-xs text-foreground-muted">Add preset:</div>
              <div className="flex flex-wrap gap-2">
                {ATTRIBUTE_PRESETS.map((p) => (
                  <Button
                    key={`${p.key}=${p.value}`}
                    size="sm"
                    variant="outline"
                    onClick={() => addAttr(p.key, p.value)}
                  >
                    + {p.key}={p.value}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Custom key</Label>
                  <Input
                    value={newAttrKey}
                    onChange={(e) => setNewAttrKey(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={newAttrVal}
                    onChange={(e) => setNewAttrVal(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={() => addAttr(newAttrKey, newAttrVal)}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label>Programme memberships</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {(user.programmes ?? []).map((p) => (
                <Badge
                  key={p.programme_id}
                  variant="outline"
                  className="flex items-center gap-1"
                >
                  {p.name}
                  <button
                    onClick={() => removeProgramme(p.programme_id)}
                    className="hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <select
                value={progPick}
                onChange={(e) => setProgPick(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-sm"
              >
                <option value="">Select programme…</option>
                {programmes
                  .filter(
                    (p) =>
                      !(user.programmes ?? []).some((m) => m.programme_id === p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <Button size="sm" onClick={() => addProgramme(progPick)}>
                Add
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserManagementPage;
