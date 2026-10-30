import { z } from "zod";
import { buildSystemPrompt, decideProposal, runAgent, STRATEGY_CHAT_TOOLS, strategyChatFocus, type AgentEvent, type AgentMessageParam } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { makePorts } from "@/lib/agent/ports";
import { supabaseProposalRepo } from "@/lib/agent/repo";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  clientId: z.string().uuid().optional(), locale: z.enum(["en", "fr", "es"]),
  message: z.string().trim().min(1).max(12000),
  /** Earlier turns of this conversation, kept by the page (nothing is stored on the server). */
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(10).default([]),
});

/**
 * Change the strategy by talking to the agent, from the Strategy section. A strategy the agent writes is applied right away
 * on the person's own session (the previous one is kept, inactive, and can be restored); everything else follows the normal
 * agent rules, limits and daily cap.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const body = parsed.data;
  const access = await resolveAgentActor(body.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("strategy-chat", 15, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  const history: AgentMessageParam[] = body.history.filter((m) => m.text.trim()).map((m) => ({ role: m.role, content: m.text }));
  while (history.length && history[0].role !== "user") history.shift();
  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const input = promptInput(actor, ctx, body.locale);
  const ports = makePorts(actor, { conversationId: null, weekStart: input.weekStart, userTexts: [...history.filter((m) => m.role === "user").map((m) => String(m.content)), body.message] });
  const system = buildSystemPrompt(input) + strategyChatFocus(!!ctx.strategy);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let open = true;
      const send = (o: unknown) => { if (!open) return; try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
      const strategies: string[] = [];
      try {
        const result = await runAgent({
          client: ai.client, model: ai.chatModel, system, messages: [...history, { role: "user", content: body.message }],
          ports, toolNames: STRATEGY_CHAT_TOOLS, maxSteps: 5,
          onEvent: (e: AgentEvent) => { if (e.type === "proposal" && e.target === "strategy" && e.id) strategies.push(e.id); else send(e); },
        });
        // The person asked for this change in this box: apply the strategy now, on their own session. Only the last one counts.
        const last = strategies.at(-1);
        if (last) {
          const r = await decideProposal(supabaseProposalRepo(actor), { proposalId: last, decision: "accept" });
          send(r.ok ? { type: "applied" } : { type: "error", code: "apply_failed" });
          if (r.ok) await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "strategy.chat_applied", entity: "client", entityId: actor.clientId });
        }
        await recordUsage(actor, result.usage.input + result.usage.output);
        await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "agent.strategy_chat", entity: "client", entityId: actor.clientId, meta: { tokens: result.usage.input + result.usage.output, applied: !!last } });
        send({ type: "done" });
      } catch (e) {
        console.error("strategy chat failed:", describeModelError(e), `model=${ai.chatModel}`);
        send({ type: "error", code: "model_error" });
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
