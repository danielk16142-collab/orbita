import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Ready for review: the agent's suggestions (pending by default; ?status=accepted|rejected|all). Decide with the decide_proposal action. */
export const GET = withApi<{ clientId: string }>(async (req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  let q = ctx.sb.from("proposals").select("id, conversation_id, target, payload, reason, status, decided_at, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  return apiJson({ proposals: data ?? [] });
});
