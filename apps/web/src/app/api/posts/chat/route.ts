import { z } from "zod";
import { buildSystemPrompt, IDEA_FORMATS, NETWORKS, postChatFocus, postChatTools, runAgent, type AgentEvent, type AgentMessageParam } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { loadClientContext, promptInput } from "@/lib/agent/context";
import { makePorts } from "@/lib/agent/ports";
import { resolveModelAccess } from "@/lib/agent/model";
import { overDailyCap, recordUsage } from "@/lib/agent/usage";
import { describeModelError, json, sameOrigin } from "@/lib/agent/http";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { parseContent } from "@orbita/content";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const Body = z.object({
  clientId: z.string().uuid().optional(), conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8000), locale: z.enum(["en", "fr", "es"]),
  format: z.enum(IDEA_FORMATS), networks: z.array(z.enum(NETWORKS)).min(1).max(5), idea: z.string().trim().max(500).default(""),
  /** Set when the chat is about an existing planned post: its details come from the database, not from this body. */
  postId: z.string().uuid().optional(),
});

/**
 * The post chat: a conversation dedicated to one post, on the "Create post" page. Same agent, brand context and safety
 * rules as the main chat, but focused on this post and limited to the tools that draft it. Drafts arrive as suggestions
 * the person edits and accepts into the calendar. These conversations are kept out of the main chat's history.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, 400);
  let body = parsed.data;
  const access = await resolveAgentActor(body.clientId);
  if (!access.ok) return json({ error: access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "not_found" }, access.status);
  const actor = access.actor;
  // An existing post: staff only, in this client, still an idea or draft. Format, network, language and idea are the post's own.
  let existing: { day: string | null; time: string | null; pillar: string | null; why: string | null; hasContent: boolean } | undefined;
  if (body.postId) {
    if (actor.profile.role === "client") return json({ error: "forbidden" }, 403);
    const { data: post } = await actor.sb.from("posts").select("id, network, language, type, status, pillar, planned_date, suggested_time, idea, caption, content").eq("id", body.postId).eq("client_id", actor.clientId).maybeSingle();
    if (!post) return json({ error: "not_found" }, 404);
    if (!["idea", "draft"].includes(post.status)) return json({ error: "not_editable" }, 409);
    const fmt = (IDEA_FORMATS as readonly string[]).includes(post.type) ? (post.type as (typeof IDEA_FORMATS)[number]) : null;
    if (!fmt) return json({ error: "bad_request" }, 400);
    const content = parseContent(post.type, post.content);
    const why = post.content && typeof post.content === "object" && "rationale" in post.content ? String((post.content as { rationale?: unknown }).rationale ?? "") : null;
    existing = { day: post.planned_date, time: post.suggested_time, pillar: post.pillar, why, hasContent: content.ok && !!content.value };
    body = { ...body, format: fmt, networks: [post.network as (typeof NETWORKS)[number]], idea: (post.idea || post.caption || "").slice(0, 500) };
  }
  const ai = await resolveModelAccess(actor);
  if (!ai) return json({ error: "not_configured" }, 503);
  if (!(await limiter("agent-chat", 20, 10 * 60_000).hit(actor.userId)).allowed) return json({ error: "rate_limited" }, 429);
  if (await overDailyCap(actor)) return json({ error: "daily_cap" }, 429);

  let conversationId = body.conversationId ?? null;
  if (conversationId) {
    const { data } = await actor.sb.from("conversations").select("id").eq("id", conversationId).eq("client_id", actor.clientId).eq("kind", "post").maybeSingle();
    if (!data) return json({ error: "not_found" }, 404);
  } else {
    const { data, error } = await actor.sb.from("conversations").insert({ client_id: actor.clientId, created_by: actor.userId, kind: "post" }).select("id").single();
    if (error || !data) { console.error(`post chat conversation failed: code=${error?.code}`); return json({ error: error?.code === "23514" ? "not_set_up" : "server_error" }, 500); }
    conversationId = data.id;
  }
  const { data: past } = await actor.sb.from("messages").select("role, content").eq("conversation_id", conversationId).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(30);
  const history: AgentMessageParam[] = (past ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: String((m.content as { text?: string }).text ?? "") })).filter((m) => m.content);
  while (history.length && history[0].role !== "user") history.shift();
  await actor.sb.from("messages").insert({ conversation_id: conversationId, client_id: actor.clientId, role: "user", content: { text: body.message } });

  const ctx = await loadClientContext(actor.sb, actor.clientId);
  const input = promptInput(actor, ctx, body.locale);
  const ports = makePorts(actor, { conversationId, weekStart: input.weekStart, fillPostId: body.postId, userTexts: [...history.filter((m) => m.role === "user").map((m) => String(m.content)), body.message] });
  const system = buildSystemPrompt(input) + postChatFocus({ format: body.format, networks: body.networks, idea: body.idea, existing });
  const convId = conversationId;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let open = true;
      const send = (o: unknown) => { if (!open) return; try { controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { open = false; } };
      send({ type: "meta", conversationId: convId });
      try {
        const result = await runAgent({
          client: ai.client, model: ai.chatModel, system, messages: [...history, { role: "user", content: body.message }],
          ports, toolNames: postChatTools(body.format), maxSteps: 6, onEvent: (e: AgentEvent) => send(e),
        });
        if (result.text.trim()) await actor.sb.from("messages").insert({ conversation_id: convId, client_id: actor.clientId, role: "assistant", content: { text: result.text } });
        await recordUsage(actor, result.usage.input + result.usage.output);
        await audit({ agencyId: actor.profile.agency_id, actor: actor.userId, action: "agent.post_chat", entity: "client", entityId: actor.clientId, meta: { format: body.format, postId: body.postId, tokens: result.usage.input + result.usage.output } });
        send({ type: "done" });
      } catch (e) {
        console.error("post chat failed:", describeModelError(e), `model=${ai.chatModel}`);
        send({ type: "error", code: "model_error" });
      } finally {
        open = false;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
