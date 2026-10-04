import "server-only";
import { z } from "zod";
import { getSession, sessionProblem, type Profile } from "@/lib/session";

export type PostRow = {
  id: string; client_id: string; network: string; language: string; type: string; status: string; pillar: string | null; persona: string | null; funnel_stage: string | null;
  planned_date: string | null; suggested_time: string | null; scheduled_at: string | null; idea: string | null; caption: string | null; hashtags: string[];
  content: unknown; script: unknown; source: string; created_by: string | null; created_at: string; updated_at: string;
};
type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type PostActor = { sb: Session["sb"]; userId: string; profile: Profile; isStaff: boolean };
export type Gate<T> = { ok: true; value: T } | { ok: false; error: "unauthorized" | "forbidden" | "not_found" };

/** Signed in, MFA and terms cleared. Database policies still decide what rows are visible. */
export async function postActor(): Promise<Gate<PostActor>> {
  const s = await getSession();
  if (!s) return { ok: false, error: "unauthorized" };
  if (await sessionProblem(s)) return { ok: false, error: "forbidden" };
  return { ok: true, value: { sb: s.sb, userId: s.user.id, profile: s.profile, isStaff: s.profile.role !== "client" } };
}

/** A post the caller may see (RLS). For client users the post must also be their own client's, checked explicitly as defense in depth. */
export async function loadPost(actor: PostActor, postId: unknown): Promise<Gate<PostRow>> {
  if (!z.string().uuid().safeParse(postId).success) return { ok: false, error: "not_found" };
  const { data } = await actor.sb.from("posts").select("*").eq("id", postId as string).maybeSingle();
  if (!data) return { ok: false, error: "not_found" };
  if (!actor.isStaff && data.client_id !== actor.profile.client_id) return { ok: false, error: "not_found" };
  return { ok: true, value: data as PostRow };
}
