// V3 Batch B item 3 — conflict banner on Card 6.
// Compares user_personal_actors fields against the canonical DB actor and
// surfaces a per-card banner with [Compare] and [Suggest correction to canonical].
import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

export interface FieldConflict {
  field: string;
  label: string;
  personal: string | null;
  canonical: string | null;
}

interface Props {
  conflicts: FieldConflict[];
  personalId: string;
  onSuggest: () => void;
}

export function CollectionConflictBanner({ conflicts, personalId, onSuggest }: Props) {
  const [compareOpen, setCompareOpen] = useState(false);
  const navigate = useNavigate();

  if (conflicts.length === 0) return null;

  return (
    <>
      <div className="mb-4">
        <CalloutRow
          variant="warning"
          title={
            <>You noted {conflicts.length === 1 ? `a different ${conflicts[0].label}` : `${conflicts.length} differences`} in your collection</>
          }
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>Compare</Button>
              <Button size="sm" variant="outline" onClick={onSuggest}>Suggest correction</Button>
            </div>
          }
        >
          {conflicts.map((c) => c.label).join(", ")}
        </CalloutRow>
      </div>


      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personal vs canonical</DialogTitle>
            <DialogDescription>
              Side-by-side view of fields where your collection differs from the canonical record.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[140px_1fr_1fr] gap-y-3 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">Field</div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">Your collection</div>
            <div className="text-[10px] uppercase tracking-wider text-foreground-muted">Canonical</div>
            {conflicts.map((c) => (
              <FragmentRow key={c.field} c={c} />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompareOpen(false)}>Close</Button>
            <Button variant="outline" onClick={() => { setCompareOpen(false); navigate(`/actors/${personalId}`); }}>
              Edit in my collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FragmentRow({ c }: { c: FieldConflict }) {
  return (
    <>
      <div className="text-foreground-secondary">{c.label}</div>
      <div className="text-foreground">{c.personal || <span className="text-foreground-muted italic">empty</span>}</div>
      <div className="text-foreground">{c.canonical || <span className="text-foreground-muted italic">empty</span>}</div>
    </>
  );
}

/** Pure helper — compute conflicts between a personal actor row and the canonical DB row. */
export function computeIdentityConflicts(
  personal: {
    actor_name?: string | null;
    country?: string | null;
    actor_website?: string | null;
    org_number?: string | null;
    street_address?: string | null;
    city?: string | null;
    region?: string | null;
  } | null,
  dbActor: {
    legal_name?: string | null;
    country?: string | null;
    websites?: string[] | null;
    org_number?: string | null;
    street_address?: string | null;
    city?: string | null;
    region?: string | null;
  } | null,
): FieldConflict[] {
  if (!personal || !dbActor) return [];
  const out: FieldConflict[] = [];
  const cmp = (label: string, field: string, p?: string | null, c?: string | null) => {
    const pn = (p ?? "").trim();
    const cn = (c ?? "").trim();
    if (pn && cn && pn.toLowerCase() !== cn.toLowerCase()) {
      out.push({ field, label, personal: pn, canonical: cn });
    }
  };
  cmp("Name", "name", personal.actor_name, dbActor.legal_name);
  cmp("Country", "country", personal.country, dbActor.country);
  cmp("Website", "website", personal.actor_website, dbActor.websites?.[0]);
  cmp("Org number", "org_number", personal.org_number, dbActor.org_number);
  cmp("Street address", "street_address", personal.street_address, dbActor.street_address);
  cmp("City", "city", personal.city, dbActor.city);
  cmp("Region", "region", personal.region, dbActor.region);
  return out;
}
