import "server-only";
import { Kickstart } from "@orbita/agent";
import type { AnalyticsData } from "@/lib/analytics/load";
import type { getSession } from "@/lib/session";

type Sb = NonNullable<Awaited<ReturnType<typeof getSession>>>["sb"];
export type KickstartState = { accountId: string; network: string; handle: string | null; ready: { id: string; startDate: string; plan: Kickstart } | null } | null;

/**
 * What the kickstart card should show: a ready plan waiting for a decision, or the offer to build one for a connected
 * account that never had one. Nothing once every account's kickstart was accepted or dismissed (or before migration 0015).
 */
export async function loadKickstart(sb: Sb, clientId: string, analytics: AnalyticsData): Promise<KickstartState> {
  const active = analytics.accounts.filter((a) => a.status === "active");
  if (!active.length) return null;
  const { data: rows, error } = await sb.from("kickstarts").select("id, account_id, plan, start_date, status").eq("client_id", clientId);
  if (error) return null;
  for (const r of rows ?? []) {
    if (r.status !== "ready") continue;
    const acc = active.find((a) => a.id === r.account_id);
    const plan = Kickstart.safeParse(r.plan);
    if (acc && plan.success) return { accountId: acc.id, network: acc.network, handle: acc.handle, ready: { id: r.id, startDate: r.start_date, plan: plan.data } };
  }
  const fresh = active.find((a) => !(rows ?? []).some((r) => r.account_id === a.id));
  return fresh ? { accountId: fresh.id, network: fresh.network, handle: fresh.handle, ready: null } : null;
}
