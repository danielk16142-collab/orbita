"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays } from "@orbita/agent";
import { resolveAgentActor } from "@/lib/agent/access";
import { localDay } from "@/lib/cadence";
import { insertIdeas } from "@/lib/posts/insert-ideas";
import { audit } from "@/lib/audit";

/** Set the weekly posting goal. Anyone who can see the client may change it; the database policies decide. */
export async function setPostingGoalAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const p = z.object({ clientId: z.string().uuid().optional(), goal: z.number().int().min(1).max(21) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { data, error } = await a.actor.sb.from("clients").update({ posting_goal: p.data.goal }).eq("id", a.actor.clientId).select("id");
  if (error) { console.error(`posting goal failed: code=${error.code}`); return { ok: false, error: ["PGRST204", "42703"].includes(error.code ?? "") ? "not_set_up" : "forbidden" }; }
  if (!data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/", "layout");
  return { ok: true };
}

const Item = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), format: z.enum(["reel", "carousel", "static", "story", "video", "text"]), title: z.string().trim().min(1).max(200), hook: z.string().trim().max(300).default(""), why: z.string().trim().max(300).default("") });

/** Add the "Fill the week" posts the person kept, as ideas on their days (only today and the next 13 days). */
export async function addWeekPostsAction(input: unknown): Promise<{ ok: boolean; added?: number; error?: string }> {
  const p = z.object({ clientId: z.string().uuid().optional(), network: z.enum(["instagram", "tiktok", "linkedin", "youtube", "facebook"]), language: z.enum(["en", "fr", "es"]), posts: z.array(Item).min(1).max(7) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok) return { ok: false, error: "forbidden" };
  const { data: client } = await a.actor.sb.from("clients").select("timezone").eq("id", a.actor.clientId).maybeSingle();
  const today = localDay(client?.timezone ?? "UTC");
  if (p.data.posts.some((x) => x.date < today || x.date > addDays(today, 13))) return { ok: false, error: "bad_request" };
  const r = await insertIdeas(a.actor, p.data.network, p.data.language, p.data.posts);
  if (!r.ok) return r;
  await audit({ agencyId: a.actor.profile.agency_id, actor: a.actor.userId, action: "posts.week_filled", entity: "client", entityId: a.actor.clientId, meta: { posts: p.data.posts.length } });
  revalidatePath("/", "layout");
  return { ok: true, added: p.data.posts.length };
}

/** Move a missed post to a new day. Staff only (client users cannot change dates; the database enforces it too). */
export async function movePostAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const p = z.object({ clientId: z.string().uuid().optional(), postId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
  if (!p.success) return { ok: false, error: "bad_request" };
  const a = await resolveAgentActor(p.data.clientId);
  if (!a.ok || a.actor.profile.role === "client") return { ok: false, error: "forbidden" };
  const { data, error } = await a.actor.sb.from("posts").update({ planned_date: p.data.date }).eq("id", p.data.postId).eq("client_id", a.actor.clientId).select("id");
  if (error || !data?.length) return { ok: false, error: "forbidden" };
  revalidatePath("/", "layout");
  return { ok: true };
}
