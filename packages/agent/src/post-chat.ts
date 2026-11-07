import { z } from "zod";
import { IDEA_FORMATS } from "./research";
import { NETWORKS } from "./types";
import { wrapUntrusted } from "./untrusted";

/**
 * The post chat on the "Create post" page and inside a post: a conversation dedicated to one post. It uses the system prompt in
 * post scope (brand, voice, rules and facts; no strategy, plans or research) plus this focus, and only the tools that draft that format.
 */
export type IdeaFormat = (typeof IDEA_FORMATS)[number];

/** Which drafting tool writes each format. Text posts and articles are written in the chat itself. */
export const POST_DRAFT_TOOL: Partial<Record<IdeaFormat, string>> = {
  reel: "propose_reel", video: "propose_reel", carousel: "propose_carousel", static: "propose_static_post", story: "propose_static_post",
};
export const postChatTools = (format: IdeaFormat) => ["get_brief", "get_account_analytics", ...(POST_DRAFT_TOOL[format] ? [POST_DRAFT_TOOL[format]!] : []),
  ...(format === "text" || format === "article" ? ["linkedin_hook_formulas", "lint_linkedin_post"] : [])];

const FORMAT_WORDS: Record<IdeaFormat, string> = {
  reel: "a reel (short vertical video)", video: "a longer video script", carousel: "a carousel", static: "a single image post",
  story: "a story (short vertical frames; draft it as a single image post with the frame text in the visual brief)", text: "a text post", article: "an article",
};

export type ExistingPost = {
  day: string | null; time: string | null; pillar: string | null; why: string | null; hasContent: boolean;
  /** What the post is now: its idea, its current draft as text (hooks, scenes, slides...), its caption and hashtags, and the script of a video that already exists. */
  idea?: string | null; draft?: string | null; caption?: string | null; hashtags?: string[]; videoScript?: string | null;
};

/** A post's structured content as plain text, for the agent to work from. */
export function contentAsText(type: string, content: unknown): string {
  const c = (content ?? null) as Record<string, unknown> | null;
  if (!c) return "";
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  if (type === "reel" || type === "video") return [
    `Hook options: ${(Array.isArray(c.hook_options) ? c.hook_options : []).map(String).join(" | ")}`,
    ...arr(c.scenes).map((x, i) => `Scene ${i + 1} (${s(x.seconds)}): visual: ${s(x.visual)} | says: ${s(x.voiceover)} | on screen: ${s(x.on_screen_text)}`),
    `Call to action: ${s(c.cta)}`, s(c.audio_note) ? `Audio: ${s(c.audio_note)}` : "",
  ].filter(Boolean).join("\n");
  if (type === "carousel") return [...arr(c.slides).map((x, i) => `Slide ${i + 1}: ${s(x.title)} | ${s(x.body)} | visual: ${s(x.visual)}`), `Call to action: ${s(c.cta)}`].join("\n");
  if (type === "static" || type === "story") return [`Headline: ${s(c.headline)}`, `Visual brief: ${s(c.visual_brief)}`, `Call to action: ${s(c.cta)}`].join("\n");
  return "";
}

export function postChatFocus(o: { format: IdeaFormat; networks: string[]; idea: string; existing?: ExistingPost }) {
  const tool = POST_DRAFT_TOOL[o.format];
  return `\n\n## This conversation: one post
You are in the post studio, helping write ONE piece of content: ${FORMAT_WORDS[o.format]} for ${o.networks.join(", ")}.${o.idea ? ` The starting idea from the person: "${o.idea.replace(/"/g, "'").slice(0, 500)}".` : ""}
${o.existing ? "" : o.idea ? "Stay on the person's idea: it is the subject. The brand profile gives you the voice and the facts; never swap the idea for another topic." : "There is no idea yet: suggest an angle from the brand profile, then write it."} ${tool
    ? `When you have a good angle, write the finished draft with ${tool}, once per network (adapt length and tone to each network). The person reviews and edits it before it goes to the calendar. Ask at most one short question first, only if something essential is missing.`
    : `Write the finished text in your reply (a hook, the body, one call to action, and hashtags if they fit the network), ready to copy. The person can save your reply as the draft.`}
If the person asks for changes, revise and present the new version the same way. Do not plan other posts or change the strategy here.${o.existing ? existingBlock(o.existing, !!tool) : ""}`;
}

/** This post already exists: it is the source of truth. The agent improves THIS post and changes only what the person asks. */
function existingBlock(e: ExistingPost, structured: boolean) {
  const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").replace(/"/g, "'").trim().slice(0, 400);
  const parts = [
    e.idea ? `What it is about:\n${wrapUntrusted("post idea", e.idea, 2000)}` : "",
    e.draft ? `Its current draft:\n${wrapUntrusted("current draft", e.draft, 6000)}` : "",
    e.caption ? `Its current caption:\n${wrapUntrusted("current caption", e.caption, 2500)}${e.hashtags?.length ? `\nHashtags: ${e.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}` : "",
    e.videoScript ? `The video already exists; this is what is said in it:\n${wrapUntrusted("video script", e.videoScript, 6000)}` : "",
  ].filter(Boolean);
  return `\n\n## The post you are working on (the source of truth)
It is in the calendar${e.day ? ` for ${e.day}${e.time ? ` at ${e.time}` : ""}` : ""}${e.pillar ? `, content pillar "${clean(e.pillar)}"` : ""}.${e.why ? ` Why it was planned: "${clean(e.why)}".` : ""}
${parts.length ? parts.join("\n\n") : "(no content yet: write it from what it is about)"}

Rules for this post:
- Work on THIS post only: same subject, same message, same facts and examples. Never bring in topics, angles or examples from the strategy, the weekly plan, research or other posts.
- Change only what the person asks. If they ask for a new caption, rewrite the caption and keep the script, hooks and scenes exactly as they are (copy them unchanged into the drafting tool). If they ask to improve the whole post, keep its subject and points and improve how it is said.${e.videoScript ? "\n- The video is already recorded: the caption must match what is said in it." : ""}
- ${structured ? "Write it once with the drafting tool for the network named above; the person reviews it and it replaces this post's draft (it does not create a new post)." : "Write the text in your reply; the person saves it into this post."} Do not ask for information that is already above.`;
}

export const IDEAS_TOOL = {
  name: "present_ideas", strict: true,
  description: "Return post ideas for the format and networks requested. Call it exactly once.",
  input_schema: { type: "object", properties: {
    ideas: { type: "array", items: { type: "object", properties: {
      title: { type: "string", description: "The idea in one line, with the angle" },
      hook: { type: "string", description: "The opening line or first slide/frame" },
      why: { type: "string", description: "One line: which part of the strategy, plan or research it comes from" },
      source: { type: "string", enum: ["strategy", "plan", "research", "brand", "results"] },
    }, required: ["title", "hook", "why", "source"], additionalProperties: false } },
  }, required: ["ideas"], additionalProperties: false },
} as const;

const Idea = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 200)), hook: z.string().trim().catch("").transform((s) => s.slice(0, 300)),
  why: z.string().trim().catch("").transform((s) => s.slice(0, 300)), source: z.enum(["strategy", "plan", "research", "brand", "results"]).catch("brand"),
});
export type PostIdea = z.infer<typeof Idea>;
export const PostIdeas = z.object({ ideas: z.array(z.unknown()).transform((a) => a.flatMap((x) => { const r = Idea.safeParse(x); return r.success ? [r.data] : []; }).slice(0, 6)) });

export function ideasRequest(format: IdeaFormat, networks: string[]) {
  const nets = networks.filter((n) => (NETWORKS as readonly string[]).includes(n));
  return `Suggest 5 ideas for ${FORMAT_WORDS[format]} on ${nets.join(", ") || "Instagram"} for this week. Ground each one in the active strategy (pillars, series, topic bank), the latest accepted plan, the saved research and what works on the accounts, in that order of preference, and name the source. Varied angles, no repeats of recent posts. Then call present_ideas.`;
}
