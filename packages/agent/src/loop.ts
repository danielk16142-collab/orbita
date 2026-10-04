import { runTool, TOOL_DEFS, type ToolPorts, type ToolState } from "./tools";

/** Minimal slice of the SDK stream we depend on, so the loop can be tested with a fake model. */
export interface AgentStream { on(event: "text", cb: (delta: string) => void): unknown; finalMessage(): Promise<AgentMessage> }
export interface AgentModelClient { stream(params: Record<string, unknown>): AgentStream }
export type AgentBlock = { type: string; [k: string]: unknown };
export type AgentMessage = {
  content: AgentBlock[]; stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
};
export type AgentMessageParam = { role: "user" | "assistant"; content: string | AgentBlock[] };

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; ok: boolean }
  | { type: "proposal"; id: string; target: string }
  | { type: "source" | "audit"; id: string }
  | { type: "error"; code: "refused" | "too_many_steps" | "truncated" };

export type AgentResult = { text: string; usage: { input: number; output: number; cacheRead: number }; stopReason: string; steps: number };

export const DEFAULT_BETAS = ["server-side-fallback-2026-07-01"];

/**
 * Streaming tool-use loop. Within ONE request chain the assistant content (including thinking
 * blocks) is appended back unchanged, as the API requires. Nothing from `thinking` is ever
 * persisted by callers: chat history is replayed across requests as plain text only, so the
 * system prompt (which changes as the agent learns) can change freely between requests.
 */
export async function runAgent(o: {
  client: AgentModelClient; model: string; system: string; messages: AgentMessageParam[]; ports: ToolPorts;
  onEvent: (e: AgentEvent) => void; maxSteps?: number; maxTokens?: number; effort?: "low" | "medium" | "high";
  /** Restrict the model to these tools (used by the learning pass). */ toolNames?: string[];
  /** Omit effort, betas and fallbacks, for smaller models that do not accept them (e.g. Haiku). */ lean?: boolean;
}): Promise<AgentResult> {
  const messages = [...o.messages];
  const state: ToolState = { proposals: 0, fetches: 0, pages: [] };
  const usage = { input: 0, output: 0, cacheRead: 0 };
  const texts: string[] = [];
  const maxSteps = o.maxSteps ?? 8;
  const tools = o.toolNames ? TOOL_DEFS.filter((t) => o.toolNames!.includes(t.name)) : TOOL_DEFS;

  for (let step = 1; step <= maxSteps; step++) {
    const stream = o.client.stream({
      model: o.model, max_tokens: o.maxTokens ?? 16000,
      ...(o.lean ? {} : { betas: DEFAULT_BETAS, fallbacks: "default", output_config: { effort: o.effort ?? "medium" } }),
      system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
      tools, messages,
    });
    let stepText = "";
    stream.on("text", (d) => { stepText += d; o.onEvent({ type: "text", text: d }); });
    const msg = await stream.finalMessage();
    usage.input += msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0);
    usage.output += msg.usage.output_tokens;
    usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    if (stepText.trim()) texts.push(stepText.trim());

    const stop = msg.stop_reason ?? "end_turn";
    // A refusal can cut a tool call off mid-input: never run tools from that turn.
    if (stop === "refusal") { o.onEvent({ type: "error", code: "refused" }); return { text: texts.join("\n\n"), usage, stopReason: stop, steps: step }; }
    const calls = msg.content.filter((b) => b.type === "tool_use") as (AgentBlock & { id: string; name: string; input: unknown })[];
    if (stop === "max_tokens" && calls.length) { o.onEvent({ type: "error", code: "truncated" }); return { text: texts.join("\n\n"), usage, stopReason: stop, steps: step }; }
    if (stop !== "tool_use" || calls.length === 0) return { text: texts.join("\n\n"), usage, stopReason: stop, steps: step };

    messages.push({ role: "assistant", content: msg.content });
    const results: AgentBlock[] = [];
    for (const c of calls) {
      const r = o.toolNames && !o.toolNames.includes(c.name)
        ? { content: "That tool is not available here.", isError: true as const }
        : await runTool(c.name, c.input, o.ports, state);
      o.onEvent({ type: "tool", name: c.name, ok: !r.isError });
      const ev = (r as { event?: { type: string; id: string; target?: string } }).event;
      if (ev?.type === "proposal") o.onEvent({ type: "proposal", id: ev.id, target: ev.target ?? "" });
      else if (ev) o.onEvent({ type: ev.type as "source" | "audit", id: ev.id });
      results.push({ type: "tool_result", tool_use_id: c.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  o.onEvent({ type: "error", code: "too_many_steps" });
  return { text: texts.join("\n\n"), usage, stopReason: "too_many_steps", steps: maxSteps };
}
