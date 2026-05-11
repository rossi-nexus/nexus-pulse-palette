import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Interpretation, ClarificationPoint, SummaryPoint, Role, Constraints, ItemStatus } from "@/types/interpretation";
import type { NeedDescription } from "@/types/need-description";

type A2Status = "not_started" | "processing" | "editing" | "locked";

const PROCESSING_MESSAGES = [
  "Extracting content from attachments…",
  "Loading ontology categories…",
  "Interpreting your need…",
  "Structuring results…",
];

interface UseInterpretationProps {
  sessionId: string | null;
}

export function useInterpretation({ sessionId }: UseInterpretationProps = { sessionId: null }) {
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [clarificationPoints, setClarificationPoints] = useState<ClarificationPoint[]>([]);
  const [status, setStatus] = useState<A2Status>("not_started");
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState("");
  const [populatingRoleIds, setPopulatingRoleIds] = useState<Set<string>>(new Set());
  const [populationFailedRoleIds, setPopulationFailedRoleIds] = useState<Set<string>>(new Set());

  // Latest-interpretation ref so async callbacks can snapshot without state-setter trickery
  const interpretationRef = useRef<Interpretation | null>(null);
  useEffect(() => {
    interpretationRef.current = interpretation;
  }, [interpretation]);

  // Load existing locked state from DB on init
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("session_step_states")
          .select("*")
          .eq("session_id", sessionId)
          .eq("step", "A2")
          .maybeSingle();
        if (error) throw error;
        if (cancelled || !data) return;
        const output = data.locked_output as { interpretation?: Interpretation; clarificationPoints?: ClarificationPoint[] } | null;
        if (data.status === "locked" && output?.interpretation) {
          setInterpretation(output.interpretation);
          setClarificationPoints(output.clarificationPoints || []);
          setStatus("locked");
        }
      } catch (e: any) {
        if (!cancelled) toast.error(`Failed to load Step 2 state: ${e?.message ?? "Unknown error"}`);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const runInterpretation = useCallback(async (needDescription: NeedDescription) => {
    setStatus("processing");
    setError(null);

    // Cycle processing messages
    let msgIndex = 0;
    const hasAttachments = needDescription.attachments.length > 0;
    const startIndex = hasAttachments ? 0 : 1;
    msgIndex = startIndex;
    setProcessingMessage(PROCESSING_MESSAGES[msgIndex]);

    const interval = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, PROCESSING_MESSAGES.length - 1);
      setProcessingMessage(PROCESSING_MESSAGES[msgIndex]);
    }, 3000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interpret-need`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ need_description: needDescription }),
        }
      );

      clearInterval(interval);

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errBody.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setInterpretation(data.interpretation);
      setClarificationPoints(data.clarification_points || []);
      setStatus("editing");
    } catch (e: any) {
      clearInterval(interval);
      setError(e.message || "Interpretation failed");
      setStatus("not_started");
    }
  }, []);

  // Summary actions
  const acceptSummaryPoint = useCallback((pointId: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: prev.summary.map(s =>
          s.id === pointId ? { ...s, status: "accepted" as ItemStatus } : s
        ),
      };
    });
  }, []);

  const rejectSummaryPoint = useCallback((pointId: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: prev.summary.map(s =>
          s.id === pointId ? { ...s, status: s.status === "rejected" ? "pending" : "rejected" as ItemStatus } : s
        ),
      };
    });
  }, []);

  const addSummaryPoint = useCallback((text: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: [...prev.summary, {
          id: crypto.randomUUID(),
          text,
          source: "manual",
          status: "accepted",
        }],
      };
    });
  }, []);

  const editSummaryPoint = useCallback((pointId: string, text: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: prev.summary.map(s =>
          s.id === pointId ? { ...s, text } : s
        ),
      };
    });
  }, []);

  // Role actions
  const acceptRole = useCallback((roleId: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        roles: prev.roles.map(r =>
          r.id === roleId ? { ...r, status: "accepted" as ItemStatus } : r
        ),
      };
    });
  }, []);

  const rejectRole = useCallback((roleId: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        roles: prev.roles.map(r =>
          r.id === roleId ? { ...r, status: r.status === "rejected" ? "pending" : "rejected" as ItemStatus } : r
        ),
      };
    });
  }, []);

  const addRole = useCallback((name: string, contextText?: string) => {
    const newRoleId = crypto.randomUUID();

    setInterpretation(prev => {
      if (!prev) return prev;
      const newRole: Role = {
        id: newRoleId,
        name: name,
        description: "",
        reasoning: "",
        targets: {
          capabilities: [],
          competences: [],
          domains: [],
          productTypes: [],
          serviceTypes: [],
        },
        constraints: {},
        dependencies: [],
        priority: prev.roles.length + 1,
        source: "manual",
        status: "accepted",
      };
      return { ...prev, roles: [...prev.roles, newRole] };
    });

    // Auto-populate the new role with ontology targets via edge function
    setPopulatingRoleIds(prev => new Set(prev).add(newRoleId));
    setPopulationFailedRoleIds(prev => {
      const next = new Set(prev);
      next.delete(newRoleId);
      return next;
    });

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");

        // Snapshot existing role names from ref (excluding the just-added one)
        const currentInterp = interpretationRef.current;
        const existingRoleNames: { name: string }[] = currentInterp
          ? currentInterp.roles
              .filter(r => r.id !== newRoleId && r.status !== "rejected")
              .map(r => ({ name: r.name }))
          : [];

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/populate-role`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              role_name: name,
              context_text: contextText || "",
              existing_roles: existingRoleNames,
            }),
          }
        );

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();

        setInterpretation(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            roles: prev.roles.map(r =>
              r.id === newRoleId
                ? {
                    ...r,
                    description: data.description || "",
                    reasoning: data.reasoning || "",
                    targets: data.targets || r.targets,
                  }
                : r
            ),
          };
        });
      } catch (e) {
        console.error("populate-role failed:", e);
        setPopulationFailedRoleIds(prev => new Set(prev).add(newRoleId));
      } finally {
        setPopulatingRoleIds(prev => {
          const next = new Set(prev);
          next.delete(newRoleId);
          return next;
        });
      }
    })();
  }, []);

  const editRoleName = useCallback((roleId: string, name: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        roles: prev.roles.map(r =>
          r.id === roleId ? { ...r, name: name } : r
        ),
      };
    });
  }, []);

  const reorderRoles = useCallback((orderedRoleIds: string[]) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      const roleMap = new Map(prev.roles.map(r => [r.id, r]));
      const reordered = orderedRoleIds
        .map((id, i) => {
          const r = roleMap.get(id);
          return r ? { ...r, priority: i + 1 } : null;
        })
        .filter(Boolean) as Role[];
      return { ...prev, roles: reordered };
    });
  }, []);

  // Ontology toggle
  const toggleSelection = useCallback((roleId: string, entryId: string, _categoryType: string) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        roles: prev.roles.map(r => {
          if (r.id !== roleId) return r;
          const toggleInCategory = (selections: typeof r.targets.capabilities) =>
            selections.map(s =>
              s.entryId === entryId ? { ...s, selected: !s.selected } : s
            );
          return {
            ...r,
            targets: {
              capabilities: toggleInCategory(r.targets.capabilities),
              competences: toggleInCategory(r.targets.competences),
              domains: toggleInCategory(r.targets.domains),
              productTypes: toggleInCategory(r.targets.productTypes),
              serviceTypes: toggleInCategory(r.targets.serviceTypes),
            },
          };
        }),
      };
    });
  }, []);

  // Constraints
  const updateConstraint = useCallback((constraintType: string, value: any) => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        constraints: { ...prev.constraints, [constraintType]: value },
      };
    });
  }, []);

  // Bulk accept
  const acceptAllPending = useCallback(() => {
    setInterpretation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        summary: prev.summary.map(s =>
          s.status === "pending" ? { ...s, status: "accepted" as ItemStatus } : s
        ),
        roles: prev.roles.map(r =>
          r.status === "pending" ? { ...r, status: "accepted" as ItemStatus } : r
        ),
      };
    });
  }, []);

  // Lock / unlock — persists to session_step_states
  const lock = useCallback(async () => {
    if (sessionId && interpretation) {
      const now = new Date().toISOString();
      const lockedOutput = { interpretation, clarificationPoints };
      const { data: existing, error: selErr } = await supabase
        .from("session_step_states")
        .select("id")
        .eq("session_id", sessionId)
        .eq("step", "A2")
        .maybeSingle();
      if (selErr) {
        toast.error(`Lock failed: ${selErr.message}`);
        return;
      }
      if (existing) {
        const { error } = await supabase
          .from("session_step_states")
          .update({ status: "locked", locked_output: lockedOutput as any, locked_at: now })
          .eq("id", existing.id);
        if (error) {
          toast.error(`Lock failed: ${error.message}`);
          return;
        }
      } else {
        const { error } = await supabase.from("session_step_states").insert([{
          session_id: sessionId,
          step: "A2",
          status: "locked",
          locked_output: lockedOutput as any,
          locked_at: now,
        }]);
        if (error) {
          toast.error(`Lock failed: ${error.message}`);
          return;
        }
      }
    }
    setStatus("locked");
  }, [sessionId, interpretation, clarificationPoints]);

  const unlock = useCallback(async () => {
    if (sessionId) {
      const { error } = await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A2");
      if (error) {
        toast.error(`Unlock failed: ${error.message}`);
        return;
      }
    }
    setStatus("editing");
  }, [sessionId]);

  // Full reset — used by upstream cascade when Step 1 unlocks
  const reset = useCallback(async () => {
    if (sessionId) {
      const { error } = await supabase
        .from("session_step_states")
        .update({ status: "editing", locked_output: null, locked_at: null })
        .eq("session_id", sessionId)
        .eq("step", "A2");
      if (error) toast.error(`Reset failed: ${error.message}`);
    }
    setInterpretation(null);
    setClarificationPoints([]);
    setStatus("not_started");
    setError(null);
    setProcessingMessage("");
    setPopulatingRoleIds(new Set());
    setPopulationFailedRoleIds(new Set());
  }, [sessionId]);

  // Computed
  const pendingCount = useMemo(() => {
    if (!interpretation) return 0;
    const pendingSummary = interpretation.summary.filter(s => s.status === "pending").length;
    const pendingRoles = interpretation.roles.filter(r => r.status === "pending").length;
    return pendingSummary + pendingRoles;
  }, [interpretation]);

  const canLock = pendingCount === 0 && interpretation !== null;

  return {
    interpretation,
    clarificationPoints,
    status,
    error,
    processingMessage,
    pendingCount,
    canLock,
    populatingRoleIds,
    populationFailedRoleIds,
    runInterpretation,
    acceptSummaryPoint,
    rejectSummaryPoint,
    addSummaryPoint,
    editSummaryPoint,
    acceptRole,
    rejectRole,
    addRole,
    editRoleName,
    reorderRoles,
    toggleSelection,
    updateConstraint,
    acceptAllPending,
    lock,
    unlock,
    reset,
  };
}
