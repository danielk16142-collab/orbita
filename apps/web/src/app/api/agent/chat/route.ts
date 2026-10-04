import { z } from "zod";
import { briefFromRow, buildSystemPrompt, computeCompleteness, ONBOARDING_THRESHOLD, runAgent, type AgentEvent, type AgentMessageParam } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { completenessOf, loadClientContext, promptInput } from "@/lib/agent/context";
import { makePorts } from "@/lib/agent/ports";
import { resolveModelAccess, webSearchTools } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  clientId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8000), locale: z.enum(["en", "fr", "es"]),
});
const HISTORY_LIMIT = 30;
const LEARN_EVERY = 8; // user messages

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  const body = parsed.data;

  // Who is this, and which client? (client users are pinned to their own client; staff need MFA and RLS visibility)
  const access = await resolveAgentActor(body.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);

  if (!(await limiter("agent-chat", 20, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const { score } = completenessOf(ctx);

  // Conversation: reuse one that belongs to THIS client, or start one.
  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const { data } = await actor.sb.from("conversations").select("id").eq("id", conversationId).eq("client_id", actor.clientId).maybeSingle();
    if (!data) return json({ error: "not_found" }, 404);
  } else {
    const { data, error } = await actor.sb.from("conversations").insert({
      client_id: actor.clientId, created_by: actor.userId, kind: score < ONBOARDING_THRESHOLD ? "onboarding" : "training",
    }).select("id").single();
    if (error || !data) return json({ error: "server_error" }, 500);
    conversationId = data.id;
  }

  // History is replayed as plain text only. Thinking blocks never leave a single request, so the
  // system prompt can change as the agent learns without breaking the conversation.
  const { data: past } = await actor.sb.from("messages").select("role, content").eq("conversation_id", conversationId).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
  const history: AgentMessageParam[] = (past ?? []).reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: String((m.content as { text?: string }).text ?? "") }))
    .filter((m) => m.content);
  while (history.length && history[0].role !== "user") history.shift();

  await actor.sb.from("messages").insert({ conversation_id: conversationId, client_id: actor.clientId, role: "user", content: { text: body.message } });
  const { count: userMsgs } = await actor.sb.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("role", "user");

  const serverTools = webSearchTools(ai.chatModel);
  const input = promptInput(actor, ctx, body.locale, { webSearch: serverTools.length > 0 });
  const userTexts = [...history.filter((m) => m.role === "user").map((m) => String(m.content)), body.message];
  const ports = makePorts(actor, { conversationId, weekStart: input.weekStart, userTexts });
  const convId = conversationId;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let open = true;
      const send = (o: unknown) => { if (!open) return; try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
      send({ type: "meta", conversationId: convId });
      try {
        const result = await runAgent({
          client: ai.client, model: ai.chatModel, system: buildSystemPrompt(input),
          messages: [...history, { role: "user", content: body.message }], ports, serverTools,
          onEvent: (e: AgentEvent) => send(e),
        });
        if (result.text.trim()) await actor.sb.from("messages").insert({ conversation_id: convId, client_id: actor.clientId, role: "assistant", content: { text: result.text } });
        await recordUsage(actor, result.usage.input + result.usage.output);
        await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "agent.chat", entity: "client", entityId: actor.clientId, meta: { steps: result.steps, tokens: result.usage.input + result.usage.output, stop: result.stopReason } });
        send({ type: "done", learnDue: (userMsgs ?? 0) > 0 && (userMsgs ?? 0) % LEARN_EVERY === 0 });
      } catch (e) {
        console.error("agent chat failed:", e instanceof Error ? e.name : "unknown");
        send({ type: "error", code: "model_error" }); // never leak provider details to the browser
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
