import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callLLM, LLMError } from "../_shared/llm-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_questions",
    description: "Return up to 3 sharp clarifying questions for the user.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              context: { type: "string", description: "Why we're asking, plain language, one sentence." },
              answer_kind: { type: "string", enum: ["free_text", "single_choice", "multi_choice", "boolean"] },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    value: { type: "string" },
                    label: { type: "string" },
                  },
                  required: ["value", "label"],
                },
              },
              target_constraint_path: {
                type: "string",
                description: "Dotted constraint path the answer should write to, e.g. constraints.geography.sourcing_intent. Empty for free_text.",
              },
            },
            required: ["question", "context", "answer_kind"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

const SYSTEM_PROMPT = `You are Axis, the questioning brain of the æXs NEXUS discovery platform.

Your job: produce 0-3 SHARP, plain-language questions that close ambiguity in a procurement need.

RULES:
- Maximum 3 questions. Fewer is better. Zero is fine if the interpretation is clean.
- Each question must be answerable with a single tap. Prefer single_choice or boolean over free_text.
- Plain language. No jargon. No "could you elaborate". Ask the actual decision the user must make.
- Each question must close a SPECIFIC gap: missing constraint, ambiguous role scope, unstated posture, sovereignty/sourcing ambiguity.
- NEVER ask about something already explicit in the interpretation.
- Provide options[] for single_choice / multi_choice / boolean.
- For boolean, use options [{value:"yes", label:"Yes"},{value:"no", label:"No"}].
- Output English regardless of input language.

PRIORITIES:
1. Missing high-impact constraints (sourcing intent, posture, security classification).
2. Ambiguity surfaced by the interpretation (clarification points).
3. Role scope ambiguity.`;

interface RequestBody {
  session_id: string;
  step: "A1" | "A2" | "A3" | "A4" | "A5";
  step_context: any;
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
    const { step, step_context } = body;

    // Steps 3-5 — framework only, no questions yet (SX-03 scope).
    if (step !== "A1" && step !== "A2") {
      return new Response(JSON.stringify({ questions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compose user message describing the step context.
    let userMessage = "";
    if (step === "A1") {
      const text: string = step_context?.context_text ?? "";
      const atts: string[] = step_context?.attachment_names ?? [];
      userMessage = `STEP: A1 (need definition).\n\nUSER DRAFT NEED:\n${text || "(empty)"}\n\nATTACHMENTS:\n${atts.length ? atts.join("\n") : "(none)"}`;
    } else {
      const interp = step_context?.interpretation ?? {};
      const cps = step_context?.clarification_points ?? [];
      const summary = (interp.summary || []).map((s: any) => `- ${s.text}`).join("\n");
      const roles = (interp.roles || []).map((r: any) => `- ${r.name}: ${r.description || r.reasoning || ""}`).join("\n");
      const constraints = JSON.stringify(interp.constraints || {}, null, 2);
      userMessage = `STEP: A2 (interpretation review).\n\nSUMMARY:\n${summary}\n\nROLES:\n${roles}\n\nCONSTRAINTS:\n${constraints}\n\nEXISTING CLARIFICATION POINTS:\n${cps.map((c: any) => `- ${c.question} (${c.context})`).join("\n") || "(none)"}`;
    }

    let questions: any[] = [];
    try {
      const result = await callLLM({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "submit_questions" } },
        max_tokens: 1500,
        requestKind: "axis-question",
      });
      questions = result.toolCall?.arguments?.questions ?? [];
    } catch (e) {
      if (e instanceof LLMError && (e.status === 429 || e.status === 402)) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("axis-question LLM error:", e);
      // Continue with empty questions; deterministic hardening still applies.
      questions = [];
    }

    // Build typed AxisQuestion objects.
    const built = questions.slice(0, 3).map((q: any) => {
      const path = typeof q.target_constraint_path === "string" ? q.target_constraint_path : "";
      const action = path
        ? { kind: "update_constraint" as const, target: path }
        : { kind: "noop" as const };
      return {
        id: crypto.randomUUID(),
        step,
        question: String(q.question || "").trim(),
        context: String(q.context || "").trim(),
        answer_kind: q.answer_kind || "free_text",
        options: Array.isArray(q.options) ? q.options : undefined,
        proposed_action: action,
        origin: "axis" as const,
      };
    }).filter((q: any) => q.question.length > 0);

    // Deterministic hardening question — ALWAYS injected when posture is crisis/wartime
    // and sourcing intent is unrestricted/absent. Replaces any LLM-generated near-duplicate.
    if (step === "A2") {
      const interp = step_context?.interpretation ?? {};
      const posture = interp?.constraints?.resilience?.posture;
      const sourcing = interp?.constraints?.geography?.sourcing_intent;
      if (
        (posture === "crisis_response" || posture === "wartime_continuity") &&
        (!sourcing || sourcing === "unrestricted")
      ) {
        // Drop any LLM question that targets the same path to avoid duplicates.
        const filtered = built.filter(
          (q: any) => q.proposed_action?.target !== "constraints.geography.sourcing_intent",
        );
        filtered.unshift({
          id: crypto.randomUUID(),
          step,
          question: "Should suppliers be restricted to domestic/allied sources for this scenario?",
          context: `Posture is ${posture.replace("_", " ")} and sourcing intent is unrestricted — sovereignty often matters here.`,
          answer_kind: "single_choice" as const,
          options: [
            { value: "national", label: "Domestic only (national)" },
            { value: "allied", label: "Allied (NATO / EU / Five Eyes)" },
            { value: "regional", label: "Regional (Nordic / Baltic)" },
            { value: "unrestricted", label: "Keep unrestricted" },
          ],
          proposed_action: {
            kind: "update_constraint" as const,
            target: "constraints.geography.sourcing_intent",
          },
          origin: "axis" as const,
        });
        built.splice(0, built.length, ...filtered.slice(0, 3));
      }
    }

    // Fold clarification_points in — convert to AxisQuestion (free_text noop) and dedup
    // against questions we already produced. SX-03: simple substring dedup.
    if (step === "A2") {
      const cps: any[] = step_context?.clarification_points ?? [];
      const existing = built.map((q: any) => q.question.toLowerCase());
      for (const cp of cps) {
        const q = String(cp?.question || "").trim();
        if (!q) continue;
        if (existing.some((e: string) => e.includes(q.toLowerCase()) || q.toLowerCase().includes(e))) continue;
        if (built.length >= 3) break;
        built.push({
          id: crypto.randomUUID(),
          step,
          question: q,
          context: String(cp?.context || "").trim(),
          answer_kind: "free_text" as const,
          proposed_action: { kind: "noop" as const },
          origin: "clarification" as const,
        });
      }
    }

    // SX-03b — HARD CAP at 3. Hardening question (if injected) is at index 0 and
    // is preserved; everything beyond 3 is truncated.
    const capped = built.slice(0, 3);

    return new Response(JSON.stringify({ questions: capped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("axis-question error:", err);
    return new Response(JSON.stringify({ error: err?.message || "axis-question failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
