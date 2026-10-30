"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { BrandFocus } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

type Result = { ok: true } | { ok: false; error: string };
const MISSING = ["PGRST204", "42703"];

/** Save what the brand talks about (topics and pillars). Anyone who can open the client can; the database policies decide. */
export async function saveFocusAction(input: unknown): Promise<Result> {
  const p = z.object({ clientId: z.string().uuid().optional(), focus: BrandFocus }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues.some((i) => String(i.message).startsWith("duplicate")) ? "duplicate" : "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  if (!(await limiter("focus-save", 30, 10 * 60_000).hit(a.actor.userId)).allowed) return { ok: false, error: "rate_limited" };
  const { sb, clientId } = a.actor;
  const row = { topics: p.data.focus.topics, pillars: p.data.focus.pillars, updated_at: new Date().toISOString() };
  const { data: existing } = await sb.from("brand_briefs").select("client_id").eq("client_id", clientId).maybeSingle();
  const { error } = existing ? await sb.from("brand_briefs").update(row).eq("client_id", clientId) : await sb.from("brand_briefs").insert({ client_id: clientId, ...row });
  if (error) { console.error(`focus save failed: code=${error.code}`); return { ok: false, error: MISSING.includes(error.code ?? "") ? "not_set_up" : "forbidden" }; }
  await audit({ agencyId: a.actor.profile.agency_id, actor: a.actor.userId, action: "brand.focus_saved", entity: "client", entityId: clientId, meta: { topics: row.topics.length, pillars: row.pillars.length } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Archive the active strategy so a new one can be built. It is kept (inactive) for the record, not deleted. */
export async function archiveStrategyAction(input: unknown): Promise<Result> {
  const p = z.object({ clientId: z.string().uuid().optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { data, error } = await a.actor.sb.from("strategies").update({ active: false }).eq("client_id", a.actor.clientId).eq("active", true).select("id");
  if (error || !data?.length) return { ok: false, error: "forbidden" };
  await audit({ agencyId: a.actor.profile.agency_id, actor: a.actor.userId, action: "strategy.archived", entity: "client", entityId: a.actor.clientId });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Put back the strategy that was active before the latest change (the newest inactive one). The one being replaced is kept, inactive. */
export async function restoreStrategyAction(input: unknown): Promise<Result> {
  const p = z.object({ clientId: z.string().uuid().optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  if (!(await limiter("strategy-restore", 20, 10 * 60_000).hit(a.actor.userId)).allowed) return { ok: false, error: "rate_limited" };
  const { sb, clientId } = a.actor;
  const [{ data: prev }, { data: cur }] = await Promise.all([
    sb.from("strategies").select("id").eq("client_id", clientId).eq("active", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("strategies").select("id").eq("client_id", clientId).eq("active", true).maybeSingle(),
  ]);
  if (!prev) return { ok: false, error: "nothing_to_restore" };
  if (cur) { const { data } = await sb.from("strategies").update({ active: false }).eq("id", cur.id).eq("client_id", clientId).select("id"); if (!data?.length) return { ok: false, error: "forbidden" }; }
  const { data, error } = await sb.from("strategies").update({ active: true }).eq("id", prev.id).eq("client_id", clientId).select("id");
  if (error || !data?.length) {
    if (cur) await sb.from("strategies").update({ active: true }).eq("id", cur.id).eq("client_id", clientId); // put things back
    return { ok: false, error: "forbidden" };
  }
  await audit({ agencyId: a.actor.profile.agency_id, actor: a.actor.userId, action: "strategy.restored", entity: "client", entityId: clientId });
  revalidatePath("/", "layout");
  return { ok: true };
}
