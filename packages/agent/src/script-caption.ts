import { z } from "zod";
import { wrapUntrusted } from "./untrusted";

/**
 * Caption from a video's script: the person already shot the video and pastes what is said in it; the agent writes the
 * caption for each network from that script (nothing added that the video does not say, apart from approved facts).
 */
const NETWORK_NOTES: Record<string, string> = {
  instagram: "Instagram: the first line must work on its own before the \"... more\" cut (under 125 characters); short paragraphs; one call to action; 3 to 5 specific hashtags.",
  tiktok: "TikTok: short (1 to 3 lines), searchable words people would type, one call to action; 3 to 5 hashtags.",
  youtube: "YouTube: the first line reads like a title (under 100 characters), then 2 to 4 lines describing the video; 2 or 3 hashtags.",
  facebook: "Facebook: conversational, 2 to 5 short lines, one question or call to action; 0 to 2 hashtags.",
  linkedin: "LinkedIn: a strong first line, short paragraphs, a takeaway, one question to start a conversation; 3 hashtags at most.",
};

export const CAPTION_FROM_SCRIPT_TOOL = {
  name: "write_captions", strict: true, description: "Return one caption per network, written from the video's script. Call it exactly once.",
  input_schema: { type: "object", properties: {
    title: { type: "string", description: "A short title for the post (under 80 characters), from the script" },
    captions: { type: "array", items: { type: "object", properties: {
      network: { type: "string", enum: Object.keys(NETWORK_NOTES) }, caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" }, description: "without the # sign" },
    }, required: ["network", "caption", "hashtags"], additionalProperties: false } },
  }, required: ["title", "captions"], additionalProperties: false },
} as const;

const tag = (s: string) => s.replace(/^#+/, "").replace(/\s+/g, "").slice(0, 60);
export const ScriptCaptions = z.object({
  title: z.string().catch("").transform((s) => s.trim().slice(0, 120)),
  captions: z.array(z.unknown()).transform((a) => a.flatMap((x) => {
    const r = z.object({ network: z.enum(Object.keys(NETWORK_NOTES) as [string, ...string[]]), caption: z.string().trim().min(1), hashtags: z.array(z.string()).default([]) }).safeParse(x);
    return r.success ? [{ network: r.data.network, caption: r.data.caption.slice(0, 2200), hashtags: [...new Set(r.data.hashtags.map(tag).filter(Boolean))].slice(0, 30) }] : [];
  })),
});
export type ScriptCaptions = z.infer<typeof ScriptCaptions>;

const LANG: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };

/** The request for write_captions: the script (as data), the networks, the language and what the post is about. */
export function captionFromScriptRequest(o: { script: string; networks: string[]; language: string; format: string; idea?: string }): string {
  return [
    `I already recorded this ${o.format}. Write the caption for each network from what is actually said in the video: ${o.networks.join(", ")}.`,
    `Language: ${LANG[o.language] ?? "English"}, written natively (not translated).`,
    "Rules: keep to what the script says; do not add facts, numbers, results, names or promises that are not in the script or in the approved facts; do not repeat the script word for word, the caption adds to the video (the key point, why it matters, one call to action); the brand's voice; no long dashes; no stock marketing words.",
    ...o.networks.map((n) => NETWORK_NOTES[n]).filter(Boolean),
    o.idea?.trim() ? `What the post is about (from the person): ${o.idea.trim().slice(0, 500)}` : "",
    `The script:\n${wrapUntrusted("video script", o.script, 8000)}`,
    "Call write_captions once, with one caption per network listed above.",
  ].filter(Boolean).join("\n\n");
}
