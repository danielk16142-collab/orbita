import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentModelClient, AgentStream } from "@orbita/agent";

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
