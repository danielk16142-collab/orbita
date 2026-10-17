import "server-only";
import { z } from "zod";
import { isTimeZone, parseContent, PostEdit, zonedToUtc } from "@orbita/content";
import type { ApiCtx } from "./auth";

export const POST_COLS = "id, client_id, network, language, type, status, planned_date, suggested_time, idea, caption, hashtags, pillar, content, scheduled_at, source, created_at, updated_at";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Fields an agent may set. Status is limited separately (see allowedStatus). */
export const PostCreate = z.object({
  network: PostEdit.shape.network, language: PostEdit.shape.language, type: PostEdit.shape.type,
  idea: z.string().trim().min(1).max(2000), caption: PostEdit.shape.caption.optional(), hashtags: PostEdit.shape.hashtags.optional(),
  pillar: PostEdit.shape.pillar.optional(), planned_date: date.nullable().optional(), suggested_time: PostEdit.shape.suggested_time.optional(),
  content: z.unknown().optional(), status: z.enum(["idea", "draft"]).default("draft"),
}).strict();
export const PostPatch = z.object({
  network: PostEdit.shape.network.optional(), language: PostEdit.shape.language.optional(), type: PostEdit.shape.type.optional(),
  idea: z.string().trim().max(2000).optional(), caption: PostEdit.shape.caption.optional(), hashtags: PostEdit.shape.hashtags.optional(),
  pillar: PostEdit.shape.pillar.optional(), planned_date: date.nullable().optional(), suggested_time: PostEdit.shape.suggested_time.optional(),
  content: z.unknown().optional(), status: z.enum(["idea", "draft", "scheduled", "published"]).optional(),
}).strict();

const LOCKED = ["scheduled", "publishing", "published"];
/** Drafts only, unless the key may schedule or publish. "approved" is never set by an agent: approval is the client's. */
export function statusProblem(ctx: ApiCtx, from: string | null, to: string | undefined): string | null {
  if (from && LOCKED.includes(from) && !ctx.key.canPublish) return "post_locked";
  if (to && (to === "scheduled" || to === "published") && !ctx.key.canPublish) return "publish_not_allowed";
  return null;
}

/** Validate structured content (reel scenes, carousel slides, static brief) for the post's type. */
export function contentFor(type: string, content: unknown): { ok: true; value: unknown } | { ok: false } {
  if (content === undefined) return { ok: true, value: undefined };
  const r = parseContent(type, content);
  return r.ok ? { ok: true, value: r.value } : { ok: false };
}

/** The instant a scheduled post goes out, from its planned day and time in the client's timezone. */
export function scheduledAt(plannedDate: string | null, time: string | null | undefined, timezone: string | null): string | null {
  if (!plannedDate) return null;
  return zonedToUtc(plannedDate, time || "09:00", timezone && isTimeZone(timezone) ? timezone : "UTC").toISOString();
}
