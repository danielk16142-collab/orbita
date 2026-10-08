import { z } from "zod";
import { buildLearnPrompt, runAgent, wrapUntrusted } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext } from "@/lib/agent/context";
import { makePorts } from "@/lib/agent/ports";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { promptInput } from "@/lib/agent/context";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().uuid().optional(), conversationId: z.string().uuid(), locale: z.enum(["en", "fr", "es"]) });
const LEARN_TOOLS = ["propose_memory", "propose_rule", "propose_brief_update", "propose_proof_item"];

/**
 * Reads a conversation and turns what is worth remembering into PROPOSALS. Nothing is saved until a
 * person accepts it. Uses a small, cheap model. Triggered by the UI every few messages or on request.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const access = await resolveAgentActor(parsed.data.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("agent-learn", 10, 60 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  const { data: conv } = await actor.sb.from("conversations").select("id").eq("id", parsed.data.conversationId).eq("client_id", actor.clientId).maybeSingle();
  if (!conv) return json({ error: "not_found" }, 404);
  const { data: msgs } = await actor.sb.from("messages").select("role, content").eq("conversation_id", conv.id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(40);
  const ordered = (msgs ?? []).reverse();
  if (ordered.filter((m) => m.role === "user").length < 2) return json({ proposals: 0 });

  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const input = promptInput(actor, ctx, parsed.data.locale);
  const ports = makePorts(actor, { conversationId: conv.id, weekStart: input.weekStart, userTexts: ordered.filter((m) => m.role === "user").map((m) => String((m.content as { text?: string }).text ?? "")) });
  const transcript = ordered.map((m) => `${m.role === "user" ? "PERSON" : "ASSISTANT"}: ${String((m.content as { text?: string }).text ?? "")}`).join("\n\n");

  let proposals = 0;
  try {
    const result = await runAgent({
      client: ai.client, model: ai.learnModel, lean: true, toolNames: LEARN_TOOLS, maxSteps: 3, maxTokens: 3000,
      system: buildLearnPrompt({ locale: parsed.data.locale, clientName: actor.client.name, brief: input.brief, memories: ctx.memories, rules: ctx.rules, proofItems: ctx.proofItems }),
      messages: [{ role: "user", content: wrapUntrusted("conversation", transcript, 30_000) }], ports,
      onEvent: (e) => { if (e.type === "proposal") proposals++; },
    });
    await recordUsage(actor, result.usage.input + result.usage.output);
  } catch (e) {
    console.error("agent learn failed:", describeModelError(e));
    return json({ error: "model_error" }, 502);
  }
  await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "agent.learn", entity: "client", entityId: actor.clientId, meta: { proposals } });
  return json({ proposals });
}
