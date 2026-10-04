import { z } from "zod";

/** Structured content of a post. The agent writes it, people edit it, the teleprompter reads it. Pure and browser-safe. */
const s = (max: number) => z.string().trim().min(1).max(max);
export const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/);

export const ReelContent = z.object({
  duration_seconds: z.number().int().min(5).max(180),
  hook_options: z.array(s(200)).min(1).max(3),
  scenes: z.array(z.object({ seconds: s(20), visual: s(300), voiceover: z.string().trim().max(600), on_screen_text: z.string().trim().max(200) })).min(1).max(15),
  cta: s(200), audio_note: z.string().trim().max(200),
});
export const CarouselContent = z.object({
  slides: z.array(z.object({ title: s(120), body: z.string().trim().max(500), visual: z.string().trim().max(300) })).min(2).max(12),
  cta: s(200),
});
export const StaticContent = z.object({ headline: s(160), visual_brief: s(500), cta: s(200) });

export type ReelContentT = z.infer<typeof ReelContent>;
export type CarouselContentT = z.infer<typeof CarouselContent>;
export type StaticContentT = z.infer<typeof StaticContent>;

export const POST_TYPES = ["reel", "carousel", "static", "story", "video", "text", "article", "post"] as const;
export const NETWORKS = ["instagram", "tiktok", "linkedin", "youtube", "facebook"] as const;
export const LANGS = ["en", "fr", "es"] as const;

/** Fields a person may change on a post (staff). Content is validated against the post's format. */
export const PostEdit = z.object({
  network: z.enum(NETWORKS), language: z.enum(LANGS), type: z.enum(POST_TYPES),
  pillar: z.string().trim().max(80), persona: z.string().trim().max(80), funnel_stage: z.string().trim().max(40),
  idea: z.string().trim().max(2000), caption: z.string().trim().max(2200),
  hashtags: z.array(s(60)).max(30),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), suggested_time: hhmm,
});

/** Validate structured content for the post's format; formats without a structure carry no content. */
export function parseContent(type: string, content: unknown) {
  if (content === null || content === undefined) return { ok: true as const, value: null };
  const schema = type === "reel" ? ReelContent : type === "carousel" ? CarouselContent : type === "static" ? StaticContent : null;
  if (!schema) return { ok: false as const };
  const r = schema.safeParse(content);
  return r.success ? { ok: true as const, value: r.data } : { ok: false as const };
}
