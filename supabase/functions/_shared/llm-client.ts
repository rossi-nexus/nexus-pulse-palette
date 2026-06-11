// SX-03 — Lovable AI Gateway seam.
// All Lovable AI Gateway URL + LOVABLE_API_KEY usage in NEW code lives here.
// Existing edge functions are backported in SX-05.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface CallLLMOptions {
  model: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  tool_choice?: unknown;
  max_tokens?: number;
  reasoning?: { effort: "low" | "medium" | "high" };
  /** Tag used for logging only. */
  requestKind?: string;
}

export interface LLMResult {
  raw: any;
  text: string;
  toolCall: { name: string; arguments: any } | null;
}

export class LLMError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function callLLM(opts: CallLLMOptions): Promise<LLMResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new LLMError("LOVABLE_API_KEY is not configured", 500, "");

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.max_tokens ?? 4096,
  };
  if (opts.reasoning) body.reasoning = opts.reasoning;
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    // 429/402 passthrough — caller can map to standard rate-limit toast.
    throw new LLMError(
      `Lovable AI Gateway returned ${resp.status} (${opts.requestKind ?? "llm"})`,
      resp.status,
      text,
    );
  }

  const data = await resp.json();
  const choice = data?.choices?.[0];
  const msg = choice?.message ?? {};
  const text: string = typeof msg.content === "string" ? msg.content : "";
  let toolCall: { name: string; arguments: any } | null = null;
  const tc = Array.isArray(msg.tool_calls) ? msg.tool_calls[0] : undefined;
  if (tc?.function?.name) {
    let args: any = {};
    try {
      args = typeof tc.function.arguments === "string"
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments ?? {};
    } catch {
      args = {};
    }
    toolCall = { name: tc.function.name, arguments: args };
  }

  return { raw: data, text, toolCall };
}
