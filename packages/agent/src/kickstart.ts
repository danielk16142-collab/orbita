import { z } from "zod";

/**
 * Kickstart: the first plan after a channel is connected. A short read of the account's results, a posting rhythm,
 * and two weeks of post ideas the person can accept onto the calendar.
 */
export const KICKSTART_FORMATS = ["reel", "carousel", "static", "story", "video", "text"] as const;
export const KICKSTART_TOOL = {
  name: "present_kickstart", strict: true,
  description: "Return the kickstart plan for this account. Call it exactly once.",
  input_schema: { type: "object", properties: {
    summary: { type: "string", description: "Two or three sentences: where the account stands today, in plain language" },
    working: { type: "array", items: { type: "string" }, description: "Up to 4 things that work, each tied to a number from the results" },
    gaps: { type: "array", items: { type: "string" }, description: "Up to 4 gaps or missed opportunities" },
    best_formats: { type: "array", items: { type: "string" }, description: "Up to 3 formats to focus on, each with a short reason" },
    best_times: { type: "string", description: "When to post, from the results; say plainly if there is not enough data yet" },
    posts_per_week: { type: "integer", description: "A rhythm this business can keep, from 1 to 7" },
    plan: { type: "array", description: "Posts for the next 14 days, matching posts_per_week", items: { type: "object", properties: {
      day_offset: { type: "integer", description: "Days from the start date: 0 to 13" },
      format: { type: "string", enum: [...KICKSTART_FORMATS] },
      title: { type: "string", description: "The idea in one line, with the angle" },
      hook: { type: "string", description: "The opening line or first frame" },
      why: { type: "string", description: "One line: which result, pillar or research it builds on" },
    }, required: ["day_offset", "format", "title", "hook", "why"], additionalProperties: false } },
  }, required: ["summary", "working", "gaps", "best_formats", "best_times", "posts_per_week", "plan"], additionalProperties: false },
} as const;

const line = (max: number) => z.string().trim().transform((s) => s.slice(0, max));
const lines = (n: number, max: number) => z.array(z.unknown()).catch([]).transform((a) => a.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim().slice(0, max)] : [])).slice(0, n));
const PlanItem = z.object({
  day_offset: z.number().int().min(0).max(13), format: z.enum(KICKSTART_FORMATS),
  title: line(200).pipe(z.string().min(1)), hook: line(300).catch(""), why: line(300).catch(""),
});
export const Kickstart = z.object({
  summary: line(800).pipe(z.string().min(1)), working: lines(4, 300), gaps: lines(4, 300), best_formats: lines(3, 200),
  best_times: line(400).catch(""), posts_per_week: z.number().int().catch(3).transform((n) => Math.min(7, Math.max(1, n))),
  plan: z.array(z.unknown()).transform((a) => a.flatMap((x) => { const r = PlanItem.safeParse(x); return r.success ? [r.data] : []; })
    .sort((x, y) => x.day_offset - y.day_offset).slice(0, 14)).pipe(z.array(z.any()).min(1)),
});
export type Kickstart = z.infer<typeof Kickstart>;
export type KickstartItem = z.infer<typeof PlanItem>;

/** The request: the brand, strategy, research and results are already in the system prompt. */
export function kickstartRequest(network: string, handle: string | null, startDate: string) {
  return [
    `${network}${handle ? ` (@${handle})` : ""} was just connected. Build its kickstart plan from the results in the analytics section and what you know about the brand, the strategy and the research.`,
    `Start date (day_offset 0) is ${startDate}. Plan ${network} posts for the next 14 days at a rhythm this business can actually keep; spread them out, favour the days and times that worked.`,
    "Be specific to this brand: no generic tips. Only cite numbers that are in the results; if there are few posts, say the read is early and lean on the strategy.",
    "Write everything in the conversation language. Call present_kickstart once.",
  ].join("\n");
}
