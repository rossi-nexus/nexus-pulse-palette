// SX-02 — minimal horizontal effect-chain renderer.
// Renders ordered stage chips with arrows. Each chip links to its role card via #role-<id>.
// Includes the standard tracked-change accept/reject affordance based on source/status.
import { ArrowRight, Check, X } from "lucide-react";
import type { EffectChain, Role } from "@/types/interpretation";
import { cn } from "@/lib/utils";

interface Props {
  chains: EffectChain[];
  roles: Role[];
  onAccept?: (chainId: string) => void;
  onReject?: (chainId: string) => void;
}

const confidenceClass = (c?: string) =>
  c === "high"
    ? "border-success/40 text-success bg-success/5"
    : c === "low"
    ? "border-warning/40 text-warning bg-warning/5"
    : "border-info/40 text-info bg-info/5";

const EffectChainStrip = ({ chains, roles, onAccept, onReject }: Props) => {
  if (!chains || chains.length === 0) return null;
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  return (
    <div className="space-y-2">
      {chains.map((chain) => {
        const isPending = chain.status === "pending";
        const isRejected = chain.status === "rejected";
        const ordered = [...chain.nodes].sort((a, b) => a.stage_index - b.stage_index);
        return (
          <div
            key={chain.id}
            className={cn(
              "border rounded-card bg-surface px-3 py-2",
              isPending ? "border-l-[3px] border-l-accent-teal border-border" : "border-border",
              isRejected && "opacity-50",
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-caption uppercase tracking-wider text-foreground-muted">Effect chain</span>
                {chain.name && <span className="text-body-sm font-medium text-foreground">{chain.name}</span>}
                {chain.confidence && (
                  <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-sharp border", confidenceClass(chain.confidence))}>
                    {chain.confidence}
                  </span>
                )}
                {isPending && <span className="text-caption text-accent-teal">proposed</span>}
              </div>
              {isPending && (onAccept || onReject) && (
                <div className="flex items-center gap-1">
                  {onAccept && (
                    <button
                      onClick={() => onAccept(chain.id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-foreground-muted hover:text-success hover:bg-success/10"
                      title="Accept chain"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onReject && (
                    <button
                      onClick={() => onReject(chain.id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-foreground-muted hover:text-destructive hover:bg-destructive/10"
                      title="Reject chain"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ordered.map((node, i) => {
                const role = roleMap.get(node.role_id);
                const label = role?.name ?? "(missing role)";
                return (
                  <div key={`${chain.id}-${i}`} className="flex items-center gap-1.5">
                    <a
                      href={`#role-${node.role_id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(`role-${node.role_id}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="inline-flex flex-col items-start px-2 py-1 rounded-sharp border border-border-subtle bg-elevated hover:border-border-accent transition-colors"
                    >
                      <span className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted">{node.stage}</span>
                      <span className="text-body-sm text-foreground">{label}</span>
                    </a>
                    {i < ordered.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-foreground-muted" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EffectChainStrip;
