import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { Interpretation } from "@/types/interpretation";
import type { ActorCardData, RoleSearchResult } from "@/hooks/useSearch";

/**
 * P13 — deterministic coverage-feedback banner.
 *
 * For each Step 2 summary point, count how many INCLUDED actors from Step 3
 * results map to that summary point via their covering roles. When a point's
 * coverage drops below 70%, surface a one-click "Add role" suggestion that
 * routes back through the existing manual-role flow.
 *
 * The Axis-driven version of this loop lives in the future E2+ surfaces.
 */
const COVERAGE_THRESHOLD = 0.7;

interface Props {
  interpretation: Interpretation | null;
  roleResults: RoleSearchResult[];
  sessionId: string | null;
  onAddRole: (name: string, summaryText: string) => Promise<void> | void;
}

interface Gap {
  summary_id: string;
  summary_text: string;
  coverage: number;
  included_count: number;
  total_included: number;
  suggested_role: string | null;
}

const CoverageBanner = ({ interpretation, roleResults, sessionId, onAddRole }: Props) => {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adopting, setAdopting] = useState<string | null>(null);

  // Map roleId -> summary points covered by that role.
  const roleToSummary = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!interpretation) return m;
    for (const p of interpretation.summary) {
      for (const rid of p.covered_by_roles ?? []) {
        if (!m.has(rid)) m.set(rid, []);
        m.get(rid)!.push(p.id);
      }
    }
    return m;
  }, [interpretation]);

  const baseGaps: Omit<Gap, "suggested_role">[] = useMemo(() => {
    if (!interpretation) return [];
    const includedByRole = new Map<string, ActorCardData[]>();
    let totalIncluded = 0;
    for (const result of roleResults) {
      const inc = result.actors.filter(a => a.triage_decision === "included");
      includedByRole.set(result.role_id, inc);
      totalIncluded += inc.length;
    }
    if (totalIncluded === 0) return [];
    return interpretation.summary
      .filter(p => p.status !== "rejected")
      .map(p => {
        const coveringRoles = (p.covered_by_roles ?? []).filter(rid => includedByRole.has(rid));
        const includedCount = coveringRoles.reduce(
          (acc, rid) => acc + (includedByRole.get(rid)?.length ?? 0),
          0,
        );
        return {
          summary_id: p.id,
          summary_text: p.text,
          coverage: totalIncluded > 0 ? includedCount / totalIncluded : 0,
          included_count: includedCount,
          total_included: totalIncluded,
        };
      })
      .filter(g => g.coverage < COVERAGE_THRESHOLD);
  }, [interpretation, roleResults]);

  // Resolve suggested role labels via deterministic RPC.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (baseGaps.length === 0) {
        setGaps([]);
        return;
      }
      const existingRoleNames = roleResults.map(r => r.role_name);
      const resolved = await Promise.all(
        baseGaps.map(async g => {
          let suggested: string | null = null;
          try {
            const { data } = await (supabase.rpc as any)("fn_suggest_role_for_summary_point", {
              p_summary_point: g.summary_text,
              p_existing_role_names: existingRoleNames,
            });
            suggested = typeof data === "string" ? data : null;
          } catch {
            suggested = "Specialist provider";
          }
          return { ...g, suggested_role: suggested } satisfies Gap;
        }),
      );
      if (!cancelled) {
        setGaps(resolved);
        // Audit each surfaced suggestion (fire-and-forget).
        for (const g of resolved) {
          if (!g.suggested_role) continue;
          (supabase.rpc as any)("fn_audit_log_event", {
            p_event_type: "coverage_role_suggested",
            p_target_table: "search_sessions",
            p_target_record_id: sessionId,
            p_actor_id: null,
            p_programme_id: null,
            p_changes: {
              session_id: sessionId,
              summary_point_id: g.summary_id,
              summary_point_text: g.summary_text,
              suggested_role: g.suggested_role,
              coverage: g.coverage,
            },
            p_reason: null,
          }).then(({ error }: { error: any }) => {
            if (error) console.warn("audit log (coverage_role_suggested) failed:", error.message);
          });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(baseGaps), sessionId]);

  const visible = gaps.filter(g => !dismissed.has(g.summary_id));
  if (visible.length === 0) return null;

  const handleAdd = async (g: Gap) => {
    if (!g.suggested_role) return;
    setAdopting(g.summary_id);
    try {
      await onAddRole(g.suggested_role, g.summary_text);
      // Audit the adoption.
      (supabase.rpc as any)("fn_audit_log_event", {
        p_event_type: "coverage_role_added",
        p_target_table: "search_sessions",
        p_target_record_id: sessionId,
        p_actor_id: null,
        p_programme_id: null,
        p_changes: {
          session_id: sessionId,
          summary_point_id: g.summary_id,
          summary_point_text: g.summary_text,
          added_role: g.suggested_role,
        },
        p_reason: null,
      }).then(({ error }: { error: any }) => {
        if (error) console.warn("audit log (coverage_role_added) failed:", error.message);
      });
      setDismissed(prev => new Set(prev).add(g.summary_id));
    } finally {
      setAdopting(null);
    }
  };

  return (
    <div className="space-y-2">
      {visible.map(g => (
        <div
          key={g.summary_id}
          className="flex items-start gap-3 px-3 py-2 rounded border border-warning/40 bg-warning/10"
        >
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-body-sm text-foreground">
            <p>
              Summary point <span className="italic">"{g.summary_text}"</span> has limited coverage{" "}
              <span className="font-mono text-mono-xs text-warning">
                ({Math.round(g.coverage * 100)}% of included actors)
              </span>
              .
              {g.suggested_role && (
                <>
                  {" "}Consider adding a new role: <span className="font-medium">"{g.suggested_role}"</span>.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {g.suggested_role && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAdd(g)}
                disabled={adopting === g.summary_id}
                className="gap-1.5 h-7 text-xs"
              >
                <Plus className="w-3 h-3" />
                Add role
              </Button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(prev => new Set(prev).add(g.summary_id))}
              className="text-caption text-foreground-muted hover:text-foreground-secondary px-2 h-7"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CoverageBanner;
