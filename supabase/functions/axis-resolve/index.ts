import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callLLM, LLMError } from "../_shared/llm-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SOURCING_INTENT_LABELS: Record<string, string> = {
  unrestricted: "Unrestricted",
  local: "Local",
  national: "National",
  regional: "Regional",
  allied: "Allied",
};
const POSTURE_LABELS: Record<string, string> = {
  steady_state: "Steady-state",
  crisis_response: "Crisis response",
  wartime_continuity: "Wartime continuity",
};

const CONSTRAINT_PATH_LABELS: Record<string, string> = {
  "constraints.geography.sourcing_intent": "Sourcing intent",
  "constraints.resilience.posture": "Resilience posture",
  "constraints.security_classification.required_level": "Security classification",
  "constraints.company_size": "Company size",
  "constraints.readiness.description": "Readiness",
  "constraints.search_context": "Search context",
  "constraints.value_chain.sensitive": "Value chain sensitivity",
};

function humanValueLabel(target: string, value: unknown): string {
  if (target === "constraints.geography.sourcing_intent" && typeof value === "string") {
    return SOURCING_INTENT_LABELS[value] ?? value;
  }
  if (target === "constraints.resilience.posture" && typeof value === "string") {
    return POSTURE_LABELS[value] ?? value;
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

const FREE_TEXT_TOOL = {
  type: "function" as const,
  function: {
    name: "map_answer",
    description: "Map a user's free-text answer onto one or more concrete tracked changes.",
    parameters: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["update_constraint", "rescope_role", "noop"] },
              target: { type: "string", description: "Dotted constraint path, e.g. constraints.readiness.description, or roles.<role_id>.<field>" },
              value: { description: "Value to write at target." },
              label: { type: "string", description: "Short pill label e.g. 'Readiness → 6 months'" },
            },
            required: ["kind", "label"],
          },
        },
        message: { type: "string", description: "Short sidebar message if no changes were possible." },
      },
      required: ["changes"],
    },
  },
};

interface RequestBody {
  session_id: string;
  step: "A1" | "A2" | "A3" | "A4" | "A5";
  question: any;
  answer: any;
  step_context?: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    const { question, answer, step, step_context } = body;
    const kind = question?.answer_kind ?? "free_text";
    const action = question?.proposed_action ?? { kind: "noop" };

    // SX-04 — A1 answers are CONTEXT, not constraint writes. Record them as `context`
    // entries so they feed forward into interpret-need without producing dangling
    // pre-interpretation constraint updates that have no landing zone.
    if (step === "A1") {
      const answerStr = typeof answer === "string" ? answer : Array.isArray(answer) ? answer.join(", ") : String(answer);
      const qText = String(question?.question ?? "").trim();
      const label = qText ? `Q: ${qText.length > 60 ? qText.slice(0, 57) + "…" : qText} → ${answerStr}` : `Answered: ${answerStr}`;
      return new Response(
        JSON.stringify({
          changes: [{
            kind: "context",
            target: undefined,
            value: { question: qText, answer: answerStr },
            label,
          }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Deterministic resolution for choice/boolean with bound action.
    if (kind === "single_choice" || kind === "boolean") {
      if (action.kind === "update_constraint" && action.target) {
        const value = answer;
        const pathLabel = CONSTRAINT_PATH_LABELS[action.target] ?? action.target;
        const change = {
          kind: "update_constraint" as const,
          target: action.target,
          value,
          label: `${pathLabel} → ${humanValueLabel(action.target, value)}`,
        };
        return new Response(JSON.stringify({ changes: [change] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // noop binding — just acknowledge.
      return new Response(JSON.stringify({ changes: [], message: "Noted." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "multi_choice") {
      if (action.kind === "update_constraint" && action.target) {
        const value = Array.isArray(answer) ? answer : [answer];
        const pathLabel = CONSTRAINT_PATH_LABELS[action.target] ?? action.target;
        return new Response(JSON.stringify({
          changes: [{
            kind: "update_constraint",
            target: action.target,
            value,
            label: `${pathLabel} → ${value.join(", ")}`,
          }],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ changes: [], message: "Noted." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // free_text → LLM-mapped.
    const interp = step_context?.interpretation ?? {};
    const constraintsSnapshot = JSON.stringify(interp?.constraints ?? {}, null, 2);
    const rolesSnapshot = (interp?.roles ?? [])
      .map((r: any) => `- ${r.id}: ${r.name}`)
      .join("\n");

    const systemPrompt = `You are Axis. Map a user's plain-English answer onto concrete tracked changes against the current interpretation.

Allowed constraint paths (write via kind="update_constraint"):
- constraints.geography.sourcing_intent  (enum: local|national|regional|allied|unrestricted)
- constraints.resilience.posture         (enum: steady_state|crisis_response|wartime_continuity)
- constraints.security_classification.required_level  (string)
- constraints.company_size               (enum: any|SMB|Mid-size|Large)
- constraints.readiness.description      (string, short)
- constraints.readiness.max_response_time (string, e.g. "6 months")
- constraints.search_context             (enum: partner_search|subcontractor_id|market_mapping|supply_chain_analysis)
- constraints.value_chain.sensitive      (boolean)

Rules:
- Output AT MOST 2 changes. Prefer 1.
- If the answer doesn't map cleanly, return { changes: [], message: "<one-line explanation>" }.
- Never invent role IDs. Use only the IDs from CURRENT ROLES.
- Labels are short — "Readiness → 6 months", "Sourcing intent → National".`;

    const userMessage = `STEP: ${step}\nQUESTION: ${question?.question ?? "(none)"}\nUSER ANSWER: ${typeof answer === "string" ? answer : JSON.stringify(answer)}\n\nCURRENT CONSTRAINTS:\n${constraintsSnapshot}\n\nCURRENT ROLES:\n${rolesSnapshot || "(none)"}`;

    try {
      const result = await callLLM({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [FREE_TEXT_TOOL],
        tool_choice: { type: "function", function: { name: "map_answer" } },
        max_tokens: 1000,
        requestKind: "axis-resolve",
      });
      const args = result.toolCall?.arguments ?? {};
      const rawChanges = Array.isArray(args.changes) ? args.changes : [];
      const changes = rawChanges
        .filter((c: any) => c?.kind && c?.label)
        .slice(0, 2)
        .map((c: any) => ({
          kind: c.kind,
          target: c.target,
          value: c.value,
          label: String(c.label),
        }));
      return new Response(JSON.stringify({
        changes,
        message: typeof args.message === "string" ? args.message : undefined,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      if (e instanceof LLMError && (e.status === 429 || e.status === 402)) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
  } catch (err: any) {
    console.error("axis-resolve error:", err);
    return new Response(JSON.stringify({ error: err?.message || "axis-resolve failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
