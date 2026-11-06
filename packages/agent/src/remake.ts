import { z } from "zod";
import { ReelContent } from "@orbita/content";
import { wrapUntrusted } from "./untrusted";

/**
 * "Make our version" of one competitor post: the same post (topic, points in the same order, structure, length, hook
 * formula), rewritten for this brand: our words, voice, offer and approved facts. Never their brand, names, numbers or claims.
 */
export type TheirPost = { hook: string; caption: string | null; transcript: string | null; network: string; competitor: string | null; formula: string | null };

const str = { type: "string" } as const;
export const REMAKE_TOOL = {
  name: "write_our_version", strict: true, description: "Return our version of the competitor's post. Call it exactly once.",
  input_schema: { type: "object", properties: {
    title: { ...str, description: "What the post is about, under 80 characters" },
    kept: { ...str, description: "One or two sentences: what we kept from their post (topic, structure, the order of the points, the hook formula)" },
    changed: { ...str, description: "One or two sentences: what we made ours (facts, offer, examples, voice)" },
    reel: { type: "object", properties: {
      duration_seconds: { type: "integer" }, hook_options: { type: "array", items: str, description: "1 to 3 options; the first follows their hook most closely" },
      scenes: { type: "array", items: { type: "object", properties: { seconds: { ...str, description: "e.g. 0-3s" }, visual: str, voiceover: str, on_screen_text: str }, required: ["seconds", "visual", "voiceover", "on_screen_text"], additionalProperties: false } },
      cta: str, audio_note: { ...str, description: "music or sound, or empty string" },
    }, required: ["duration_seconds", "hook_options", "scenes", "cta", "audio_note"], additionalProperties: false },
    caption: str, hashtags: { type: "array", items: str, description: "without the # sign" },
  }, required: ["title", "kept", "changed", "reel", "caption", "hashtags"], additionalProperties: false },
} as const;

const tag = (s: string) => s.replace(/^#+/, "").replace(/\s+/g, "").slice(0, 60);
const trimReel = (r: unknown) => {
  const x = (r ?? {}) as Record<string, unknown>;
  const cut = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  return {
    duration_seconds: Math.min(180, Math.max(5, Math.round(Number(x.duration_seconds) || 30))),
    hook_options: (Array.isArray(x.hook_options) ? x.hook_options : []).map((h) => cut(h, 200)).filter(Boolean).slice(0, 3),
    scenes: (Array.isArray(x.scenes) ? x.scenes : []).slice(0, 15).map((s) => { const o = (s ?? {}) as Record<string, unknown>; return { seconds: cut(o.seconds, 20) || "-", visual: cut(o.visual, 300) || "-", voiceover: cut(o.voiceover, 600), on_screen_text: cut(o.on_screen_text, 200) }; }),
    cta: cut(x.cta, 200), audio_note: cut(x.audio_note, 200),
  };
};
export const OurVersion = z.object({
  title: z.string().catch("").transform((s) => s.trim().slice(0, 120)),
  kept: z.string().catch("").transform((s) => s.trim().slice(0, 600)),
  changed: z.string().catch("").transform((s) => s.trim().slice(0, 600)),
  reel: z.unknown().transform(trimReel).pipe(ReelContent),
  caption: z.string().trim().min(1).transform((s) => s.slice(0, 2200)),
  hashtags: z.array(z.string()).catch([]).transform((a) => [...new Set(a.map(tag).filter(Boolean))].slice(0, 30)),
});
export type OurVersion = z.infer<typeof OurVersion>;

const LANG: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };

export function remakeRequest(p: TheirPost, o: { language: string; notes?: string }): string {
  return [
    `Make OUR version of this ${p.network} post${p.competitor ? ` by ${p.competitor}` : ""}. It must be clearly the same post adapted to us, not a different idea inspired by it:`,
    "- Keep: the same topic and message, the same points in the same order, the same structure and pacing, about the same length, the same kind of hook" + (p.formula ? ` (formula: ${p.formula})` : "") + ", the same kind of call to action.",
    "- Change: every sentence in our own words and voice (never copy their sentences); their brand, names, products, prices, numbers, results and claims become ours, using only facts from our profile and approved claims. If a point of theirs needs a fact we do not have, keep the point and say it without a number.",
    "- Write it as a reel (scenes with the spoken words and on-screen text), plus the caption and hashtags for the same network.",
    `Language: ${LANG[o.language] ?? "English"}, written natively.`,
    o.notes?.trim() ? `Notes from the person: ${o.notes.trim().slice(0, 500)}` : "",
    `Their hook:\n${wrapUntrusted("competitor hook", p.hook, 400)}`,
    p.caption?.trim() ? `Their caption:\n${wrapUntrusted("competitor caption", p.caption, 2500)}` : "",
    p.transcript?.trim() ? `What is said in their video:\n${wrapUntrusted("competitor transcript", p.transcript, 8000)}` : "We do not have what is said in their video: follow the hook and the caption closely.",
    "Call write_our_version once.",
  ].filter(Boolean).join("\n\n");
}
