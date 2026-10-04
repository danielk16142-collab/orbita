import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentModelClient, AgentStream } from "@orbita/agent";
import type { AgentActor } from "./access";

/** Main chat model. Opus 5.5 by default; set ORBITA_AGENT_MODEL=claude-sonnet-5-5 for a cheaper option. */
export const chatModel = () => process.env.ORBITA_AGENT_MODEL || "claude-opus-5-5";
/** Cheap model for the background learning pass. */
export const learnModel = () => process.env.ORBITA_LEARN_MODEL || "claude-haiku-4-5";

export const agentConfigured = () => !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN;

let client: Anthropic | null = null;
export function createModelClient(): AgentModelClient {
  client ??= new Anthropic({ maxRetries: 2, timeout: 5 * 60_000 });
  const c = client;
  return { stream: (params) => c.beta.messages.stream(params as never) as unknown as AgentStream };
}

export const dailyTokenCap = () => Number(process.env.AGENT_DAILY_TOKEN_CAP ?? 500_000);

/** Models that support the server-side web search tool. */
export const supportsWebSearch = (m: string) => /^claude-(opus-(4-6|4-7|4-8|5|5-5)|sonnet-(4-6|5|5-5)|fable-5|mythos-5)/.test(m);

/** Web search for research (trends, competitors, dates). Off with AGENT_WEB_SEARCH=off or on models without it. */
export function webSearchTools(model: string): Record<string, unknown>[] {
  if (process.env.AGENT_WEB_SEARCH === "off" || !supportsWebSearch(model)) return [];
  return [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }];
}

export type ModelAccess = {
  client: AgentModelClient;
  chatModel: string;
  learnModel: string;
  /** Who pays for this client's AI usage. Always "agency" today; "client" once client-owned keys exist (docs/byok.md). */
  billing: "agency" | "client";
};

/**
 * THE one place that decides which Claude credentials and models a client's requests use.
 * Today every client uses the agency's key. Client-owned keys (docs/byok.md) plug in here:
 * look up the client's encrypted key, decrypt it server-side, and return a client built with it,
 * without touching the chat route, the learning route or the agent package.
 * Returns null when no AI credentials are available for this client.
 */
export async function resolveModelAccess(_actor: AgentActor): Promise<ModelAccess | null> {
  if (!agentConfigured()) return null;
  return { client: createModelClient(), chatModel: chatModel(), learnModel: learnModel(), billing: "agency" };
}
