"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays, Kickstart } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { audit } from "@/lib/audit";
import { insertIdeas } from "@/lib/posts/insert-ideas";

type Result = { ok: true; added?: number } | { ok: false; error: string };
const Base = { clientId: z.string().uuid().optional(), id: z.string().uuid() };

/**
 * Accept a kickstart: the chosen posts go on the calendar as ideas on their dates, and (if asked) the weekly goal becomes
 * the plan's rhythm. Posts are inserted with the person's own session, so the usual post rules apply.
 */
export async function acceptKickstartAction(input: unknown): Promise<Result> {
  const p = z.object({ ...Base, items: z.array(z.number().int().min(0).max(13)).max(14), language: z.enum(["en", "fr", "es"]), setGoal: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { sb, clientId, userId, profile } = a.actor;
  const { data: row } = await sb.from("kickstarts").select("id, network, plan, start_date, status").eq("id", p.data.id).eq("client_id", clientId).maybeSingle();
  if (!row || row.status !== "ready") return { ok: false, error: "not_found" };
  const plan = Kickstart.safeParse(row.plan);
  if (!plan.success) return { ok: false, error: "not_found" };
  const chosen = [...new Set(p.data.items)].map((i) => plan.data.plan[i]).filter(Boolean);
  if (chosen.length) {
    const r = await insertIdeas(a.actor, row.network, p.data.language, chosen.map((it) => ({ ...it, date: addDays(row.start_date, it.day_offset) })));
    if (!r.ok) return r;
  }
  if (p.data.setGoal) await sb.from("clients").update({ posting_goal: plan.data.posts_per_week }).eq("id", clientId);
  await sb.from("kickstarts").update({ status: "accepted", decided_at: new Date().toISOString() }).eq("id", row.id);
  await audit({ agencyId: profile.agency_id, actor: userId, action: "kickstart.accepted", entity: "client", entityId: clientId, meta: { posts: chosen.length } });
  revalidatePath("/", "layout");
  return { ok: true, added: chosen.length };
}

/** Put the kickstart away without adding anything. It can be built again later. */
export async function dismissKickstartAction(input: unknown): Promise<Result> {
  const p = z.object(Base).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { data } = await a.actor.sb.from("kickstarts").update({ status: "dismissed", decided_at: new Date().toISOString() }).eq("id", p.data.id).eq("client_id", a.actor.clientId).select("id");
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/", "layout");
  return { ok: true };
}
