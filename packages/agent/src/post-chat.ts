import { z } from "zod";
import { IDEA_FORMATS } from "./research";
import { NETWORKS } from "./types";

/**
 * The post chat on the "Create post" page: a conversation dedicated to one post. It uses the normal system prompt (brand,
 * strategy, research, analytics) plus this focus, and only the tools that can draft that format.
 */
export type IdeaFormat = (typeof IDEA_FORMATS)[number];

/** Which drafting tool writes each format. Text posts and articles are written in the chat itself. */
export const POST_DRAFT_TOOL: Partial<Record<IdeaFormat, string>> = {
  reel: "propose_reel", video: "propose_reel", carousel: "propose_carousel", static: "propose_static_post", story: "propose_static_post",
};
export const postChatTools = (format: IdeaFormat) => ["get_brief", "get_account_analytics", ...(POST_DRAFT_TOOL[format] ? [POST_DRAFT_TOOL[format]!] : [])];

const FORMAT_WORDS: Record<IdeaFormat, string> = {
  reel: "a reel (short vertical video)", video: "a longer video script", carousel: "a carousel", static: "a single image post",
  story: "a story (short vertical frames; draft it as a single image post with the frame text in the visual brief)", text: "a text post", article: "an article",
};

export type ExistingPost = { day: string | null; time: string | null; pillar: string | null; why: string | null; hasContent: boolean };

export function postChatFocus(o: { format: IdeaFormat; networks: string[]; idea: string; existing?: ExistingPost }) {
  const tool = POST_DRAFT_TOOL[o.format];
  return `\n\n## This conversation: one post
You are in the post studio, helping write ONE piece of content: ${FORMAT_WORDS[o.format]} for ${o.networks.join(", ")}.${o.idea ? ` The starting idea from the person: "${o.idea.replace(/"/g, "'").slice(0, 500)}".` : ""}
Stay on this post. Base the angle on the active strategy, the latest plan and the research above when they exist, and say which one you used. ${tool
    ? `When you have a good angle, write the finished draft with ${tool}, once per network (adapt length and tone to each network). The person reviews and edits it before it goes to the calendar. Ask at most one short question first, only if something essential is missing.`
    : `Write the finished text in your reply (a hook, the body, one call to action, and hashtags if they fit the network), ready to copy. The person can save your reply as the draft.`}
If the person asks for changes, revise and present the new version the same way. Do not plan other posts or change the strategy here.${o.existing ? existingBlock(o.existing, !!tool) : ""}`;
}

/** This post is already in the calendar (usually from the strategy or the weekly plan): the draft fills it, it does not add another one. */
function existingBlock(e: ExistingPost, structured: boolean) {
  const clean = (v: string | null) => (v ?? "").replace(/\s+/g, " ").replace(/"/g, "'").trim().slice(0, 400);
  return `\n\n## This post is already planned
It is in the calendar${e.day ? ` for ${e.day}${e.time ? ` at ${e.time}` : ""}` : ""}${e.pillar ? `, content pillar "${clean(e.pillar)}"` : ""}.${e.why ? ` Why it was recommended: "${clean(e.why)}".` : ""} Write the finished content for THIS post and keep its angle unless the person asks otherwise. ${e.hasContent ? "It already has a draft: write a better version, do not repeat it. " : ""}${structured ? "Write it once with the drafting tool for the network named above; the person reviews it and it fills this post (it does not create a new one)." : "Write the text in your reply; the person saves it into this post."} Do not ask for information that is already above.`;
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
