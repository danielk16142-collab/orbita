import { bestPostingWindows } from "@orbita/agent";
import { apiActor, apiError, apiJson, withApi } from "@/lib/api/auth";
import { dashboardFor, loadAnalyticsData } from "@/lib/analytics/load";

export const dynamic = "force-dynamic";

/** Results from the connected accounts: headline numbers (30 days vs the 30 before), per network, best posts, best posting windows (UTC). */
export const GET = withApi<{ clientId: string }>(async (_req, ctx, { clientId }) => {
  const a = await apiActor(ctx, clientId);
  if (!a) return apiError("not_found", 404);
  const data = await loadAnalyticsData(a.sb, clientId);
  const d = dashboardFor(data);
  return apiJson({
    accounts: data.accounts.map((x) => ({ network: x.network, handle: x.handle, status: x.status, last_synced_at: x.last_synced_at })),
    tiles: d.tiles, per_network: d.perNetwork, top_posts: d.topPosts, posting_windows_utc: bestPostingWindows(data.posts),
  });
});
