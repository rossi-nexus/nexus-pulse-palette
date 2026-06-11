import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConstraintPill {
  key: string;
  label: string;
}

interface Props {
  constraints: any;
  onRemove: (key: string) => void;
  className?: string;
}

/** AX3b — derive active constraint pills from the interpretation constraints. */
export function buildConstraintPills(constraints: any): ConstraintPill[] {
  if (!constraints || typeof constraints !== "object") return [];
  const out: ConstraintPill[] = [];
  const g = constraints.geography ?? {};
  if (Array.isArray(g.countries) && g.countries.length > 0) {
    out.push({ key: "geography.countries", label: `Country: ${g.countries.map((c: string) => c.toUpperCase()).join(", ")}` });
  }
  if (Array.isArray(g.cities) && g.cities.length > 0) {
    out.push({ key: "geography.cities", label: `City: ${g.cities.join(", ")}` });
  }
  if (g.radius_km) out.push({ key: "geography.radius_km", label: `Radius: ${g.radius_km}km` });

  const cap = constraints.capacity ?? {};
  if (cap.min_team_size) out.push({ key: "capacity.min_team_size", label: `Min team: ${cap.min_team_size}` });
  if (cap.max_mobilization_days) out.push({ key: "capacity.max_mobilization_days", label: `Mobilize ≤${cap.max_mobilization_days}d` });

  const certs = constraints.certifications ?? constraints.standards ?? {};
  if (Array.isArray(certs.required)) certs.required.forEach((c: string) => out.push({ key: `certifications.required:${c}`, label: `Cert: ${c}` }));
  if (Array.isArray(certs.preferred)) certs.preferred.forEach((c: string) => out.push({ key: `certifications.preferred:${c}`, label: `Pref: ${c}` }));

  if (constraints.urgency?.level) out.push({ key: "urgency.level", label: `Urgency: ${constraints.urgency.level}` });
  if (constraints.budget?.max_eur) out.push({ key: "budget.max_eur", label: `Budget ≤ €${constraints.budget.max_eur}` });

  const sec = constraints.security_classification?.required_level;
  if (sec && sec !== "any") out.push({ key: "security_classification.required_level", label: `Clearance: ${sec}` });

  // SX-02 — sourcing intent, resilience posture, value chain
  const si = constraints.geography?.sourcing_intent;
  if (si && si !== "unrestricted") {
    const label = si.charAt(0).toUpperCase() + si.slice(1);
    out.push({ key: "geography.sourcing_intent", label: `Sourcing: ${label}` });
  }
  const posture = constraints.resilience?.posture;
  if (posture && posture !== "steady_state") {
    const human = posture === "crisis_response" ? "Crisis response" : "Wartime continuity";
    out.push({ key: "resilience", label: `Posture: ${human}` });
  }
  const vc = constraints.value_chain;
  if (vc?.sensitive) {
    const count = Array.isArray(vc.chokepoint_concerns) ? vc.chokepoint_concerns.length : 0;
    out.push({ key: "value_chain", label: `Value chain: sensitive${count ? ` (${count} concern${count === 1 ? "" : "s"})` : ""}` });
  }

  return out;
}


const ConstraintPills = ({ constraints, onRemove, className }: Props) => {
  const pills = buildConstraintPills(constraints);
  if (pills.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {pills.map((p) => (
        <span
          key={p.key}
          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-sharp bg-elevated border border-border-subtle text-foreground-secondary"
        >
          {p.label}
          <button
            type="button"
            onClick={() => onRemove(p.key)}
            className="text-foreground-muted hover:text-destructive transition-colors"
            title="Remove constraint"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
};

export default ConstraintPills;
