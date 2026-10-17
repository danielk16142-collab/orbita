import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Agent conversation threads, newest first. A thread with a summary is closed: agent_chat starts a new one that carries its handover. */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const { data } = await ctx.sb.from("conversations").select("id, kind, summary, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50);
  return apiJson({ conversations: data ?? [] });
});
