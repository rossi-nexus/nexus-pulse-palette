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
import { Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import ProvenanceBadge from "@/components/actor-profile/ProvenanceBadge";

type RelType =
  | "parent_of"
  | "subsidiary_of"
  | "acquired"
  | "acquired_by"
  | "former_name_of"
  | "renamed_to"
  | "merged_with";

const REL_LABELS: Record<RelType, string> = {
  parent_of: "Parent of",
  subsidiary_of: "Subsidiary of",
  acquired: "Acquired",
  acquired_by: "Acquired by",
  former_name_of: "Former name of",
  renamed_to: "Renamed to",
  merged_with: "Merged with",
};

interface Row {
  id: string;
  source_actor_id: string;
  target_actor_id: string;
  relationship_type: RelType;
  evidence: string | null;
  source_url: string | null;
  target_legal_name?: string;
  source_legal_name?: string;
}

interface Props {
  actorId: string;
  canEdit: boolean;
}

const RelatedEntitiesSection = ({ actorId, canEdit }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("actor_relationships")
      .select("*")
      .or(`source_actor_id.eq.${actorId},target_actor_id.eq.${actorId}`);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const ids = Array.from(
      new Set(
        (data ?? []).flatMap((r) => [r.source_actor_id, r.target_actor_id]),
      ),
    );
    const { data: actors } = await supabase
      .from("actors")
      .select("id, legal_name")
      .in("id", ids);
    const nameMap = new Map((actors ?? []).map((a) => [a.id, a.legal_name]));
    setRows(
      (data ?? []).map((r) => ({
        ...(r as Row),
        target_legal_name: nameMap.get(r.target_actor_id) ?? "Unknown",
        source_legal_name: nameMap.get(r.source_actor_id) ?? "Unknown",
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [actorId]);

  const remove = async (id: string) => {
    if (!confirm("Remove this relationship?")) return;
    const { error } = await supabase.from("actor_relationships").delete().eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-foreground-muted" />
          <span className="text-foreground-muted text-xs">
            {rows.length} relationship{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add relationship
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-foreground-muted text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-foreground-muted text-sm">
          No related entities recorded.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isSource = r.source_actor_id === actorId;
            const other = isSource ? r.target_legal_name : r.source_legal_name;
            const otherId = isSource ? r.target_actor_id : r.source_actor_id;
            const label = isSource
              ? REL_LABELS[r.relationship_type]
              : `(inverse) ${REL_LABELS[r.relationship_type]}`;
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 bg-elevated/40 border border-border rounded-md px-3 py-2"
              >
                <Badge variant="outline" className="text-[10px] mt-0.5">
                  {label}
                </Badge>
                <div className="mt-0.5">
                  <ProvenanceBadge
                    source={r.source_url ? "auto_enrichment" : null}
                    source_url={r.source_url}
                    evidence={r.evidence}
                    size="sm"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={`/actors/${otherId}`}
                    className="text-sm text-foreground hover:underline"
                  >
                    {other}
                  </a>
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
            );
          })}
        </div>
      )}

      <AddRelationshipDialog
        open={adding}
        onClose={() => setAdding(false)}
        sourceActorId={actorId}
        onAdded={() => {
          setAdding(false);
          void load();
        }}
      />
    </div>
  );
};

const AddRelationshipDialog = ({
  open,
  onClose,
  sourceActorId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  sourceActorId: string;
  onAdded: () => void;
}) => {
  const [type, setType] = useState<RelType>("subsidiary_of");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; legal_name: string }>>(
    [],
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("actors")
        .select("id, legal_name")
        .ilike("legal_name", `%${query}%`)
        .neq("id", sourceActorId)
        .limit(10);
      if (!cancelled) setResults(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, sourceActorId]);

  const submit = async () => {
    if (!targetId) return;
    setBusy(true);
    const { error } = await supabase.from("actor_relationships").insert({
      source_actor_id: sourceActorId,
      target_actor_id: targetId,
      relationship_type: type,
      evidence: evidence || null,
      source_url: sourceUrl || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Relationship added");
    setQuery("");
    setTargetId(null);
    setEvidence("");
    setSourceUrl("");
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add relationship</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-foreground-muted">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RelType)}
              className="w-full bg-surface border border-border rounded-md px-2 py-1 text-sm"
            >
              {Object.entries(REL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  This actor — {v.toLowerCase()} →
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-foreground-muted">Target actor</label>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTargetId(null);
              }}
              placeholder="Search by legal name…"
            />
            {results.length > 0 && !targetId && (
              <div className="border border-border rounded-md mt-1 max-h-40 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setTargetId(r.id);
                      setQuery(r.legal_name);
                      setResults([]);
                    }}
                    className="block w-full text-left px-2 py-1 text-sm hover:bg-elevated"
                  >
                    {r.legal_name}
                  </button>
                ))}
              </div>
            )}
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
          <Button disabled={!targetId || busy} onClick={submit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RelatedEntitiesSection;
