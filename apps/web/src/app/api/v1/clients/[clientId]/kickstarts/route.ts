import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

/** Kickstart plans and connected social accounts (ids for kickstart_run and refresh_account). */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  if (!(await apiActor(ctx, clientId))) return apiError("not_found", 404);
  const [{ data: kickstarts }, { data: accounts }] = await Promise.all([
    ctx.sb.from("kickstarts").select("id, account_id, network, plan, start_date, status, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    ctx.sb.from("social_accounts").select("id, network, handle, status, last_synced_at").eq("client_id", clientId),
  ]);
  return apiJson({ kickstarts: kickstarts ?? [], accounts: accounts ?? [] });
});
