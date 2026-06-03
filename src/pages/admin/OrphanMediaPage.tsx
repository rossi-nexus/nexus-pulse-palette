// V3 Batch C §2 — Reviewer queue for orphan product media.
// Lists actor_media rows where type='product' AND crop_data.linked_product_name IS NULL
// AND crop_data.review_status IS NOT 'not_product'. Admins can link to a
// product, confirm the candidate, delete, or mark as not-a-product.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Trash2,
  Link2,
  Check,
  X as XIcon,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OrphanRow {
  id: string;
  url: string;
  actor_id: string;
  crop_data: any;
  actor?: { legal_name: string } | null;
  products?: string[];
}

const OrphanMediaPage = () => {
  const [rows, setRows] = useState<OrphanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [productOptions, setProductOptions] = useState<Map<string, string[]>>(new Map());

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("actor_media")
        .select("id, url, actor_id, crop_data, actors:actor_id(legal_name)")
        .eq("type", "product")
        .is("crop_data->>linked_product_name", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        toast.error(`Failed to load orphans: ${error.message}`);
        setRows([]);
        return;
      }
      const filtered = (data ?? []).filter(
        (r: any) => (r.crop_data?.review_status ?? "") !== "not_product",
      );
      setRows(filtered as OrphanRow[]);

      // Preload product options per distinct actor.
      const actorIds = Array.from(new Set(filtered.map((r: any) => r.actor_id))) as string[];
      const optMap = new Map<string, string[]>();
      await Promise.all(
        actorIds.map(async (aid) => {
          const { data: descs } = await supabase
            .from("actor_descriptions")
            .select("name")
            .eq("actor_id", aid)
            .eq("type", "product")
            .not("name", "is", null);
          const names = Array.from(
            new Set((descs ?? []).map((d: any) => d.name).filter(Boolean)),
          ) as string[];
          optMap.set(aid, names);
        }),
      );
      setProductOptions(optMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patchCropData = async (id: string, patch: Record<string, any>) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const next = { ...(row.crop_data ?? {}), ...patch };
    const { error } = await supabase
      .from("actor_media")
      .update({ crop_data: next })
      .eq("id", id);
    if (error) throw new Error(error.message);
  };

  const linkToProduct = async (id: string, productName: string) => {
    setWorkingId(id);
    try {
      await patchCropData(id, { linked_product_name: productName });
      toast.success(`Linked to "${productName}"`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e: any) {
      toast.error(`Link failed: ${e?.message ?? "unknown"}`);
    } finally {
      setWorkingId(null);
    }
  };

  const confirmCandidate = async (row: OrphanRow) => {
    const candidate = row.crop_data?.candidate_product_name;
    if (!candidate) {
      toast.error("No candidate on file.");
      return;
    }
    await linkToProduct(row.id, candidate);
  };

  const remove = async (id: string) => {
    setWorkingId(id);
    try {
      const { error } = await supabase.from("actor_media").delete().eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Deleted");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message ?? "unknown"}`);
    } finally {
      setWorkingId(null);
    }
  };

  const markNotProduct = async (id: string) => {
    setWorkingId(id);
    try {
      await patchCropData(id, { review_status: "not_product" });
      toast.success("Marked as not a product image");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      toast.error(`Update failed: ${e?.message ?? "unknown"}`);
    } finally {
      setWorkingId(null);
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} orphan media row(s)?`)) return;
    const ids = Array.from(selected);
    const total = ids.length;
    let ok = 0;
    for (const id of ids) {
      const { error } = await supabase.from("actor_media").delete().eq("id", id);
      if (!error) ok++;
      toast.message(`Processed ${ok} of ${total} rows…`, { id: "bulk-progress" });
    }
    toast.success(`Deleted ${ok} of ${total}`, { id: "bulk-progress" });
    setSelected(new Set());
    void load();
  };

  const bulkMarkNotProduct = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const total = ids.length;
    let ok = 0;
    for (const id of ids) {
      try {
        await patchCropData(id, { review_status: "not_product" });
        ok++;
        toast.message(`Processed ${ok} of ${total} rows…`, { id: "bulk-progress" });
      } catch {
        /* continue */
      }
    }
    toast.success(`Marked ${ok} of ${total} as not-product`, { id: "bulk-progress" });
    setSelected(new Set());
    void load();
  };

  const bulkLinkToProduct = async (productName: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const total = ids.length;
    let ok = 0;
    for (const id of ids) {
      try {
        await patchCropData(id, { linked_product_name: productName });
        ok++;
        toast.message(`Processed ${ok} of ${total} rows…`, { id: "bulk-progress" });
      } catch {
        /* continue */
      }
    }
    toast.success(`Linked ${ok} of ${total} to "${productName}"`, { id: "bulk-progress" });
    setSelected(new Set());
    void load();
  };

  // Intersection of products available across all selected rows' actors.
  // Disabled if rows span multiple actors.
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedActorIds = Array.from(new Set(selectedRows.map((r) => r.actor_id)));
  const bulkLinkDisabled = selectedActorIds.length > 1;
  const bulkLinkProducts = bulkLinkDisabled || selectedActorIds.length === 0
    ? []
    : (productOptions.get(selectedActorIds[0]) ?? []);

  const headerCount = useMemo(() => `${rows.length} orphan row${rows.length === 1 ? "" : "s"}`, [rows.length]);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Unlinked product media</h1>
          <p className="text-body-sm text-foreground-muted">
            Auto-enrichment kept these images but couldn't confidently tie them to a specific
            product. Link them to a product, confirm the candidate, mark them as not-a-product, or
            delete. {headerCount}.
          </p>
        </header>

        {/* Bulk action toolbar is now floating; see bottom of the page. */}

        {loading ? (
          <p className="text-foreground-muted text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
            No unlinked product media. The queue is empty.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface text-[10px] uppercase tracking-wider text-foreground-muted">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="px-2 py-2 text-left">Thumbnail</th>
                  <th className="px-2 py-2 text-left">Actor</th>
                  <th className="px-2 py-2 text-left">Candidate</th>
                  <th className="px-2 py-2 text-left">Source</th>
                  <th className="px-2 py-2 text-left">Reason</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const products = productOptions.get(r.actor_id) ?? [];
                  return (
                    <tr key={r.id} className="border-t border-border/60 align-top">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={r.url}
                            alt=""
                            className="h-14 w-20 object-cover rounded border border-border/60 bg-elevated"
                          />
                        </a>
                      </td>
                      <td className="px-2 py-2 text-foreground">
                        <Link to={`/actors/${r.actor_id}`} className="hover:underline">
                          {r.actor?.legal_name ?? r.actor_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-foreground-secondary">
                        {r.crop_data?.candidate_product_name ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-foreground-muted">
                        {r.crop_data?.source_page ? (
                          <a
                            href={r.crop_data.source_page}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {(() => {
                              try {
                                return new URL(r.crop_data.source_page).hostname.replace(/^www\./, "");
                              } catch {
                                return r.crop_data.source_page;
                              }
                            })()}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-foreground-muted italic max-w-[180px]">
                        {r.crop_data?.link_reason ?? "—"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {products.length > 0 ? (
                            <Select
                              onValueChange={(v) => linkToProduct(r.id, v)}
                              disabled={workingId === r.id}
                            >
                              <SelectTrigger className="h-7 text-[11px] w-40">
                                <SelectValue placeholder="Link to product…" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p} value={p} className="text-xs">
                                    {p}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[10px] text-foreground-muted italic">
                              No products
                            </span>
                          )}
                          {r.crop_data?.candidate_product_name && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              disabled={workingId === r.id}
                              onClick={() => confirmCandidate(r)}
                              title={`Accept "${r.crop_data.candidate_product_name}"`}
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={workingId === r.id}
                            onClick={() => markNotProduct(r.id)}
                            title="Not a product image"
                          >
                            <XIcon className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2"
                            disabled={workingId === r.id}
                            onClick={() => remove(r.id)}
                            title="Delete"
                          >
                            {workingId === r.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
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
    </div>
  );
};

export default OrphanMediaPage;
