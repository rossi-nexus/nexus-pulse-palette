import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import ProvenanceBadge from "@/components/actor-profile/ProvenanceBadge";
import { toast } from "sonner";

type AliasType = "former_name" | "trade_name" | "brand" | "abbreviation";

interface Row {
  id: string;
  alias_name: string;
  alias_type: AliasType | null;
  valid_from: string | null;
  valid_to: string | null;
  evidence: string | null;
  source_url: string | null;
}

const TYPE_LABELS: Record<AliasType, string> = {
  former_name: "Former name",
  trade_name: "Trade name",
  brand: "Brand",
  abbreviation: "Abbreviation",
};

const AliasesSection = ({
  actorId,
  canEdit,
}: {
  actorId: string;
  canEdit: boolean;
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("actor_aliases")
      .select("*")
      .eq("actor_id", actorId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [actorId]);

  const remove = async (id: string) => {
    if (!confirm("Remove this alias?")) return;
    const { error } = await supabase.from("actor_aliases").delete().eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-foreground-muted text-xs">
          {rows.length} alias{rows.length === 1 ? "" : "es"}
        </span>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add alias
          </Button>
        )}
      </div>
      {loading ? (
        <div className="text-foreground-muted text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-foreground-muted text-sm">No aliases recorded.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-3 bg-elevated/40 border border-border rounded-md px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground font-medium">
                    {r.alias_name}
                  </span>
                  {r.alias_type && (
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[r.alias_type]}
                    </Badge>
                  )}
                </div>
                {(r.valid_from || r.valid_to) && (
                  <div className="text-xs text-foreground-muted mt-1">
                    {r.valid_from ? new Date(r.valid_from).getFullYear() : "?"} —{" "}
                    {r.valid_to ? new Date(r.valid_to).getFullYear() : "present"}
                  </div>
                )}
                {r.evidence && (
                  <div className="text-xs text-foreground-muted mt-1">
                    {r.evidence}
                  </div>
                )}
                {r.source_url && (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-info hover:underline"
                  >
                    Source
                  </a>
                )}
              </div>
              {canEdit && (
                <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddAliasDialog
        open={adding}
        onClose={() => setAdding(false)}
        actorId={actorId}
        onAdded={() => {
          setAdding(false);
          void load();
        }}
      />
    </div>
  );
};

const AddAliasDialog = ({
  open,
  onClose,
  actorId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  actorId: string;
  onAdded: () => void;
}) => {
  const [name, setName] = useState("");
  const [type, setType] = useState<AliasType>("former_name");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [evidence, setEvidence] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from("actor_aliases").insert({
      actor_id: actorId,
      alias_name: name,
      alias_type: type,
      valid_from: validFrom || null,
      valid_to: validTo || null,
      evidence: evidence || null,
      source_url: sourceUrl || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Alias added");
    setName("");
    setEvidence("");
    setSourceUrl("");
    setValidFrom("");
    setValidTo("");
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add alias</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-foreground-muted">Alias name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AliasType)}
              className="w-full bg-surface border border-border rounded-md px-2 py-1 text-sm"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-foreground-muted">Valid from</label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-foreground-muted">Valid to</label>
              <Input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Evidence</label>
            <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Source URL</label>
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name || busy} onClick={submit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AliasesSection;
