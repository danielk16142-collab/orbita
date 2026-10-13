import "server-only";
import { buildLearnPrompt, runAgent, wrapUntrusted } from "@orbita/agent";
import type { AgentActor } from "./access";
import { loadClientContext, promptInput } from "./context";
import { makePorts } from "./ports";
import type { ModelAccess } from "./model";
import { recordUsage } from "./usage";

const LEARN_TOOLS = ["propose_memory", "propose_rule", "propose_brief_update", "propose_proof_item"];
export type Turn = { role: string; content: unknown };
export const turnText = (m: Turn) => String((m.content as { text?: string }).text ?? "");

/**
 * Reads a conversation and turns what is worth remembering into PROPOSALS (nothing is saved until a person accepts it).
 * Used every few messages and once more when a day's thread closes. Returns how many proposals were made.
 */
export async function learnFromConversation(actor: AgentActor, ai: ModelAccess, conversationId: string, locale: "en" | "fr" | "es", ordered: Turn[]): Promise<number> {
  if (ordered.filter((m) => m.role === "user").length < 2) return 0;
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const input = promptInput(actor, ctx, locale);
  const ports = makePorts(actor, { conversationId, weekStart: input.weekStart, userTexts: ordered.filter((m) => m.role === "user").map(turnText) });
  const transcript = ordered.map((m) => `${m.role === "user" ? "PERSON" : "ASSISTANT"}: ${turnText(m)}`).join("\n\n");
  let proposals = 0;
  const result = await runAgent({
    client: ai.client, model: ai.learnModel, lean: true, toolNames: LEARN_TOOLS, maxSteps: 3, maxTokens: 3000,
    system: buildLearnPrompt({ locale, clientName: actor.client.name, brief: input.brief, memories: ctx.memories, rules: ctx.rules, proofItems: ctx.proofItems }),
    messages: [{ role: "user", content: wrapUntrusted("conversation", transcript, 30_000) }], ports,
    onEvent: (e) => { if (e.type === "proposal") proposals++; },
  });
  await recordUsage(actor, result.usage.input + result.usage.output);
  return proposals;
}
