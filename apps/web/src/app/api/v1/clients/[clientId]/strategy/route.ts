import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** The active content strategy (objectives, pillars, series, cadence, topics, links), or null. */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const { data } = await ctx.sb.from("strategies").select("id, title, period, content, created_at").eq("client_id", clientId).eq("active", true).maybeSingle();
  return apiJson({ strategy: data ?? null });
});
