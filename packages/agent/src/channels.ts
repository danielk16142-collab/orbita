import { z } from "zod";
import { wrapUntrusted } from "./untrusted";

/**
 * Channels without an official connection (TikTok through Apify, LinkedIn through its analytics export): a summary of the
 * numbers, and the agent's audit of them with recommendations. Pure functions; the app loads and stores the data.
 */
export type TikTokVideo = { url: string | null; hook: string; views: number | null; likes: number | null; comments: number | null; shares: number | null; followers: number | null; postedAt: string | null };
export type TikTokSummary = {
  followers: number | null; followersDelta: number | null;
  period: { from: string; to: string };
  videos30: number; views30: number; avgViews30: number | null; medianViews: number | null; engagementRate: number | null; postsPerWeek: number;
  top: TikTokVideo[]; low: TikTokVideo[]; videos: TikTokVideo[];
};

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The account's last 30 days, its best and weakest videos, and the change in followers since the previous snapshot. */
export function summarizeTikTok(videos: TikTokVideo[], now: Date, previousFollowers: number | null = null): TikTokSummary {
  const from = day(new Date(now.getTime() - 30 * 864e5)), to = day(now), weekAgo = day(new Date(now.getTime() - 7 * 864e5));
  const clean = videos.map((v) => ({ ...v, hook: v.hook.slice(0, 200) })).sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")).slice(0, 30);
  const recent = clean.filter((v) => v.postedAt && v.postedAt >= from);
  const views30 = recent.reduce((n, v) => n + (v.views ?? 0), 0);
  const eng30 = recent.reduce((n, v) => n + (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0), 0);
  const followers = clean.map((v) => v.followers).find((f): f is number => typeof f === "number") ?? null;
  const withViews = clean.filter((v) => typeof v.views === "number");
  const byViews = [...withViews].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return {
    followers, followersDelta: followers != null && previousFollowers != null ? followers - previousFollowers : null,
    period: { from, to }, videos30: recent.length, views30,
    avgViews30: recent.length ? Math.round(views30 / recent.length) : null,
    medianViews: median(withViews.map((v) => v.views as number)),
    engagementRate: views30 ? Math.round((eng30 / views30) * 10000) / 10000 : null,
    postsPerWeek: Math.round((recent.length / (30 / 7)) * 10) / 10,
    top: byViews.slice(0, 3),
    low: byViews.filter((v) => (v.postedAt ?? "") <= weekAgo).slice(-3).reverse(), // a video needs a week before it counts as weak
    videos: clean,
  };
}

const str = { type: "string" } as const;
export const CHANNEL_AUDIT_TOOL = {
  name: "present_channel_audit", strict: true, description: "Return the audit of this channel. Call it exactly once.",
  input_schema: { type: "object", properties: {
    verdict: { ...str, description: "One sentence: how the account is doing, with the key number" },
    working: { type: "array", items: str, description: "2 to 4 things that work, each tied to a number or a post" },
    not_working: { type: "array", items: str, description: "2 to 4 things that hold it back, each tied to a number or a post" },
    recommendations: { type: "array", items: { type: "object", properties: {
      title: { ...str, description: "The recommendation in a few words" }, why: { ...str, description: "The number or pattern behind it" }, how: { ...str, description: "Exactly what to do, concretely" },
    }, required: ["title", "why", "how"], additionalProperties: false }, description: "3 to 6, most impact first" },
    this_week: { type: "array", items: str, description: "2 or 3 things to do this week" },
  }, required: ["verdict", "working", "not_working", "recommendations", "this_week"], additionalProperties: false },
} as const;

const line = (max: number) => z.string().catch("").transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));
const lines = (n: number, max: number) => z.array(z.unknown()).catch([]).transform((a) => a.map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "")).filter(Boolean).slice(0, n));
export const ChannelAudit = z.object({
  verdict: line(400), working: lines(5, 300), not_working: lines(5, 300),
  recommendations: z.array(z.unknown()).catch([]).transform((a) => a.flatMap((x) => { const r = z.object({ title: line(120), why: line(400), how: line(500) }).safeParse(x); return r.success && r.data.title ? [r.data] : []; }).slice(0, 6)),
  this_week: lines(3, 300),
});
export type ChannelAudit = z.infer<typeof ChannelAudit>;

const pct = (x: number | null) => (x == null ? "unknown" : `${(x * 100).toFixed(1)}%`);
const n = (x: number | null) => (x == null ? "unknown" : String(x));

export function channelAuditRequest(network: "tiktok" | "linkedin", summary: unknown, language: string): string {
  const LANG: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };
  const head = `Audit this ${network === "tiktok" ? "TikTok" : "LinkedIn"} account and end with recommendations to keep growing. Write in ${LANG[language] ?? "English"}. Use only the numbers below and what you know of the brand; never invent a number. Be direct: say what to keep, what to stop, what to try, and tie every point to a number or a post.`;
  if (network === "tiktok") {
    const s = summary as TikTokSummary;
    const vid = (v: TikTokVideo) => `${v.postedAt ?? "?"} · ${n(v.views)} views · ${n(v.likes)} likes · ${n(v.comments)} comments · ${n(v.shares)} shares · opening: ${v.hook}`;
    return [head,
      `Numbers (${s.period.from} to ${s.period.to}): followers ${n(s.followers)}${s.followersDelta != null ? ` (${s.followersDelta >= 0 ? "+" : ""}${s.followersDelta} since the last check)` : ""}; ${s.videos30} videos in 30 days (${s.postsPerWeek} a week); ${s.views30} views in 30 days, ${n(s.avgViews30)} on average; median views of the last ${s.videos.length} videos ${n(s.medianViews)}; engagement rate ${pct(s.engagementRate)} (likes, comments and shares over views).`,
      `Best videos:\n${wrapUntrusted("tiktok best videos", s.top.map(vid).join("\n"), 2000)}`,
      s.low.length ? `Weakest videos (at least a week old):\n${wrapUntrusted("tiktok weakest videos", s.low.map(vid).join("\n"), 2000)}` : "",
      `All recent videos, newest first:\n${wrapUntrusted("tiktok recent videos", s.videos.slice(0, 20).map(vid).join("\n"), 5000)}`,
      "TikTok craft to judge against: the first 2 seconds decide the view (open on the payoff, never a greeting); one idea per video; consistent posting; captions with words people search; replies and stitches extend reach.",
      "Call present_channel_audit once.",
    ].filter(Boolean).join("\n\n");
  }
  const s = summary as { period: { from: string | null; to: string | null }; impressions: number | null; membersReached: number | null; engagements: number | null; engagementRate: number | null; followers: number | null; newFollowers: number | null; weeks: { start: string; impressions: number; engagements: number; newFollowers: number }[]; topPosts: { url: string; date: string | null; engagements: number | null; impressions: number | null }[]; demographics: { category: string; value: string; share: number | null }[] };
  return [head,
    `Numbers (${s.period.from ?? "?"} to ${s.period.to ?? "?"}): impressions ${n(s.impressions)}, members reached ${n(s.membersReached)}, engagements ${n(s.engagements)}, engagement rate ${pct(s.engagementRate)}, followers ${n(s.followers)} (${n(s.newFollowers)} new in the period).`,
    s.weeks.length ? `By week (impressions / engagements / new followers):\n${s.weeks.map((w) => `${w.start}: ${w.impressions} / ${w.engagements} / ${w.newFollowers}`).join("\n")}` : "",
    s.topPosts.length ? `Top posts (the export has links and numbers, not the text):\n${wrapUntrusted("linkedin top posts", s.topPosts.map((p) => `${p.date ?? "?"} · ${n(p.impressions)} impressions · ${n(p.engagements)} engagements · ${p.url}`).join("\n"), 3000)}` : "",
    s.demographics.length ? `Who sees the posts:\n${wrapUntrusted("linkedin audience", s.demographics.map((d) => `${d.category}: ${d.value}${d.share != null ? ` (${Math.round(d.share * 100)}%)` : ""}`).join("\n"), 2000)}` : "",
    "LinkedIn craft to judge against: a hook alone on line 1 under about 140 characters, 900-1,300 characters, short paragraphs, one idea per post, no links in the body (first comment), at most 3 hashtags, a specific closing question; consistency (2-4 posts a week); comments in the first hour and commenting on others' posts grow reach; is the audience the buyers the brand wants?",
    "Call present_channel_audit once.",
  ].filter(Boolean).join("\n\n");
}
