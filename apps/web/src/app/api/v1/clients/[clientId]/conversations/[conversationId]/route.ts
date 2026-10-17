import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** The messages of one thread, oldest first. */
export const GET = withApi<{ clientId: string; conversationId: string }>(async (_req, ctx, { clientId, conversationId }) => {
  if (!(await apiActor(ctx, clientId)) || !/^[0-9a-f-]{36}$/i.test(conversationId)) return apiError("not_found", 404);
  const { data: conv } = await ctx.sb.from("conversations").select("id, kind, summary, created_at").eq("id", conversationId).eq("client_id", clientId).maybeSingle();
  if (!conv) return apiError("not_found", 404);
  const { data } = await ctx.sb.from("messages").select("role, content, created_at").eq("conversation_id", conversationId).in("role", ["user", "assistant"]).order("created_at").limit(500);
  return apiJson({ conversation: conv, messages: (data ?? []).map((m) => ({ role: m.role, text: String((m.content as { text?: string }).text ?? ""), created_at: m.created_at })) });
});
