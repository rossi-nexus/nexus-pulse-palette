import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  constraints: any;
  originalConstraints: any;
  onApply: (next: any) => void;
}

const EditConstraintsSlideOver = ({ open, onOpenChange, constraints, originalConstraints, onApply }: Props) => {
  const [draft, setDraft] = useState<any>(constraints);
  useEffect(() => { if (open) setDraft(constraints ?? {}); }, [open, constraints]);

  const set = (path: string[], value: any) => {
    setDraft((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev ?? {}));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        cur[path[i]] = cur[path[i]] ?? {};
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
  };

  const countries: string[] = draft?.geography?.countries ?? [];
  const reqCerts: string[] = draft?.certifications?.required ?? draft?.standards?.required ?? [];
  const prefCerts: string[] = draft?.certifications?.preferred ?? draft?.standards?.preferred ?? [];

  const addToArray = (path: string[], value: string) => {
    if (!value) return;
    let cur = draft;
    for (const p of path) cur = cur?.[p];
    const arr = Array.isArray(cur) ? [...cur] : [];
    if (!arr.includes(value)) arr.push(value);
    set(path, arr);
  };
  const removeFromArray = (path: string[], value: string) => {
    let cur = draft;
    for (const p of path) cur = cur?.[p];
    const arr = (Array.isArray(cur) ? cur : []).filter((v: string) => v !== value);
    set(path, arr);
  };

  const [newCountry, setNewCountry] = useState("");
  const [newReqCert, setNewReqCert] = useState("");
  const [newPrefCert, setNewPrefCert] = useState("");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit constraints</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Geography */}
          <section className="space-y-2">
            <Label>Geography — countries (ISO-2)</Label>
            <div className="flex flex-wrap gap-1.5">
              {countries.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-sharp bg-elevated border border-border-subtle">
                  {c.toUpperCase()}
                  <button onClick={() => removeFromArray(["geography", "countries"], c)} className="text-foreground-muted hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input value={newCountry} onChange={(e) => setNewCountry(e.target.value)} placeholder="NO" maxLength={3} />
              <Button size="sm" variant="outline" onClick={() => { addToArray(["geography", "countries"], newCountry.toUpperCase().trim()); setNewCountry(""); }}>Add</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-caption">City</Label>
                <Input
                  value={draft?.geography?.cities?.[0] ?? ""}
                  onChange={(e) => set(["geography", "cities"], e.target.value ? [e.target.value] : [])}
                />
              </div>
              <div>
                <Label className="text-caption">Radius (km)</Label>
                <Input
                  type="number"
                  value={draft?.geography?.radius_km ?? ""}
                  onChange={(e) => set(["geography", "radius_km"], e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
          </section>

          {/* Capacity */}
          <section className="space-y-2">
            <Label>Capacity</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-caption">Min team size</Label>
                <Input
                  type="number"
                  value={draft?.capacity?.min_team_size ?? ""}
                  onChange={(e) => set(["capacity", "min_team_size"], e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div>
                <Label className="text-caption">Max mobilization (days)</Label>
                <Input
                  type="number"
                  value={draft?.capacity?.max_mobilization_days ?? ""}
                  onChange={(e) => set(["capacity", "max_mobilization_days"], e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
          </section>

          {/* Certifications */}
          <section className="space-y-2">
            <Label>Certifications — required</Label>
            <div className="flex flex-wrap gap-1.5">
              {reqCerts.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-sharp bg-elevated border border-border-subtle">
                  {c}
                  <button onClick={() => removeFromArray(["certifications", "required"], c)} className="text-foreground-muted hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input value={newReqCert} onChange={(e) => setNewReqCert(e.target.value)} placeholder="ISO 9001" />
              <Button size="sm" variant="outline" onClick={() => { addToArray(["certifications", "required"], newReqCert.trim()); setNewReqCert(""); }}>Add</Button>
            </div>

            <Label className="pt-2 block">Certifications — preferred</Label>
            <div className="flex flex-wrap gap-1.5">
              {prefCerts.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-sharp bg-elevated border border-border-subtle">
                  {c}
                  <button onClick={() => removeFromArray(["certifications", "preferred"], c)} className="text-foreground-muted hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input value={newPrefCert} onChange={(e) => setNewPrefCert(e.target.value)} placeholder="AQAP 2110" />
              <Button size="sm" variant="outline" onClick={() => { addToArray(["certifications", "preferred"], newPrefCert.trim()); setNewPrefCert(""); }}>Add</Button>
            </div>
          </section>

          {/* Urgency / budget */}
          <section className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-caption">Urgency</Label>
              <select
                className="w-full bg-surface border border-border-subtle rounded-sharp px-2 py-1.5 text-body-sm"
                value={draft?.urgency?.level ?? ""}
                onChange={(e) => set(["urgency", "level"], e.target.value || null)}
              >
                <option value="">—</option>
                {["low", "medium", "high", "critical"].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-caption">Budget (€)</Label>
              <Input
                type="number"
                value={draft?.budget?.max_eur ?? ""}
                onChange={(e) => set(["budget", "max_eur"], e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </section>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="ghost" onClick={() => setDraft(originalConstraints ?? {})}>Reset to original</Button>
          <Button onClick={() => { onApply(draft); onOpenChange(false); }}>Apply & re-run</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EditConstraintsSlideOver;
