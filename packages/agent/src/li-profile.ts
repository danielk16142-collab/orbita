import { z } from "zod";
import rubric from "./data/li-rubric.json";
import { wrapUntrusted } from "./untrusted";

/**
 * LinkedIn profile score, ported from li-profile in linkedin-agent-skill (Jake Schincariol, MIT; rubric in data/li-rubric.json,
 * unchanged): twelve items, 100 points. The written parts are scored by the model against the rubric; the factual parts
 * (photo, activity, contact, recommendations) are scored here from what the person selected, so they cannot be talked up.
 * The total is always added up here.
 */
export type RubricItem = { id: string; points: number; full_marks: string };
export const LI_RUBRIC = (rubric as { items: RubricItem[] }).items;
export const LI_TEXT_ITEMS = ["headline", "about_open", "about_body", "featured", "banner", "current_role", "experience_depth", "skills"] as const;

export const LinkedInProfileInput = z.object({
  headline: z.string().trim().max(400).default(""),
  about: z.string().trim().max(3000).default(""),
  currentRole: z.string().trim().max(3000).default(""),
  pastRoles: z.string().trim().max(4000).default(""),
  featured: z.string().trim().max(1000).default(""),
  banner: z.string().trim().max(300).default(""),
  topSkills: z.string().trim().max(300).default(""),
  photo: z.enum(["recent_face", "old_face", "logo_or_other", "none"]).default("none"),
  activity: z.enum(["7d", "30d", "older", "never"]).default("never"),
  recommendations: z.number().int().min(0).max(100).default(0),
  recommendationsNameOutcomes: z.boolean().default(false),
  customUrl: z.boolean().default(false),
  contactLink: z.boolean().default(false),
  sameHandle: z.boolean().default(false),
});
export type LinkedInProfileInput = z.infer<typeof LinkedInProfileInput>;

/** The factual items, scored from the person's answers. */
export function factScores(p: LinkedInProfileInput): Record<"photo" | "activity" | "contact" | "recommendations", { score: number; why: string }> {
  const photo = { recent_face: 6, old_face: 3, logo_or_other: 1, none: 0 }[p.photo];
  const activity = { "7d": 10, "30d": 5, older: 1, never: 0 }[p.activity];
  const contact = (p.customUrl ? 2 : 0) + (p.contactLink ? 2 : 0) + (p.sameHandle ? 2 : 0);
  const recs = Math.min(8, (p.recommendations >= 3 ? 6 : p.recommendations * 2) + (p.recommendations > 0 && p.recommendationsNameOutcomes ? 2 : 0));
  return {
    photo: { score: photo, why: p.photo },
    activity: { score: activity, why: p.activity },
    contact: { score: contact, why: [p.customUrl && "custom URL", p.contactLink && "email or booking link", p.sameHandle && "same handle as other platforms"].filter(Boolean).join(", ") || "none of the three" },
    recommendations: { score: recs, why: `${p.recommendations} in the last two years${p.recommendationsNameOutcomes ? ", naming outcomes" : ""}` },
  };
}

const str = { type: "string" } as const;
const scoreList = { type: "array", items: { type: "object", properties: { id: { type: "string", enum: [...LI_TEXT_ITEMS] }, score: { type: "integer" }, why: { ...str, description: "one short line: what costs points, or what earns full marks" } }, required: ["id", "score", "why"], additionalProperties: false } } as const;
export const PROFILE_SCORE_TOOL = {
  name: "score_linkedin_profile", strict: true, description: "Score the written parts of the profile against the rubric, then rewrite them. Call it exactly once.",
  input_schema: { type: "object", properties: {
    scores: { ...scoreList, description: "one entry per written item, scored honestly against its full marks" },
    rewrites: { type: "object", properties: {
      headline_options: { type: "array", items: str, description: "3 headlines, up to 220 characters: {what you do for whom} | {proof} | {how to start}; never the job title, never opening with 'Helping'" },
      about_open: { ...str, description: "the first two lines of the about: who they help and what changes" },
      about_body: { ...str, description: "the rest of the about, to one reader in the second person: their problem, what you do, one number as proof, what to do next; under 1,400 characters with the opening" },
      current_role: { ...str, description: "one line of scope, then 2-3 outcome bullets with numbers (use {{your number}} where a number is unknown)" },
      featured: { type: "array", items: str, description: "the 3 featured items to add: best post, a proof asset, the way to contact" },
      banner: { ...str, description: "one line of positioning and one way to reach you" },
      top_skills: { type: "array", items: str, description: "the 3 skills to pin first" },
    }, required: ["headline_options", "about_open", "about_body", "current_role", "featured", "banner", "top_skills"], additionalProperties: false },
    projected: { ...scoreList, description: "the written items re-scored as if the rewrites were pasted in; honest, not 100 by default" },
    still_needs: { type: "array", items: str, description: "what a rewrite cannot create (recommendations, a real banner image, posting history, a photo)" },
  }, required: ["scores", "rewrites", "projected", "still_needs"], additionalProperties: false },
} as const;

const clampScores = (a: unknown) => {
  const out: Record<string, { score: number; why: string }> = {};
  for (const x of Array.isArray(a) ? a : []) {
    const r = z.object({ id: z.enum(LI_TEXT_ITEMS), score: z.number(), why: z.string().default("") }).safeParse(x);
    if (!r.success || out[r.data.id]) continue;
    const max = LI_RUBRIC.find((i) => i.id === r.data.id)!.points;
    out[r.data.id] = { score: Math.max(0, Math.min(max, Math.round(r.data.score))), why: r.data.why.trim().slice(0, 300) };
  }
  return out;
};
const text = (max: number) => z.string().catch("").transform((s) => s.trim().slice(0, max));
export const ProfileScoreResult = z.object({
  scores: z.unknown().transform(clampScores),
  rewrites: z.object({
    headline_options: z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim().slice(0, 220)).filter(Boolean).slice(0, 3)),
    about_open: text(400), about_body: text(2600), current_role: text(2000),
    featured: z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 3)),
    banner: text(200),
    top_skills: z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 3)),
  }),
  projected: z.unknown().transform(clampScores),
  still_needs: z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 6)),
});
export type ProfileScoreResult = z.infer<typeof ProfileScoreResult>;

export type ProfileScore = { items: { id: string; points: number; score: number; projected: number; why: string; from: "rubric" | "answers" }[]; total: number; projectedTotal: number };

/** One table: the model's scores for the written items, ours for the factual ones, totals added up here. */
export function combineProfileScore(p: LinkedInProfileInput, r: ProfileScoreResult): ProfileScore {
  const facts = factScores(p);
  const items = LI_RUBRIC.map((i) => {
    if (i.id in facts) { const f = facts[i.id as keyof typeof facts]; return { id: i.id, points: i.points, score: f.score, projected: f.score, why: f.why, from: "answers" as const }; }
    const s = r.scores[i.id] ?? { score: 0, why: "not scored" };
    return { id: i.id, points: i.points, score: s.score, projected: Math.max(s.score, r.projected[i.id]?.score ?? s.score), why: s.why, from: "rubric" as const };
  });
  return { items, total: items.reduce((n, i) => n + i.score, 0), projectedTotal: items.reduce((n, i) => n + i.projected, 0) };
}

const LANG: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };

export function profileScoreRequest(p: LinkedInProfileInput, language: string): string {
  const facts = factScores(p);
  const rubricText = LI_RUBRIC.filter((i) => (LI_TEXT_ITEMS as readonly string[]).includes(i.id)).map((i) => `- ${i.id} (${i.points} points): ${i.full_marks}`).join("\n");
  const field = (name: string, v: string, max: number) => `${name}:\n${v ? wrapUntrusted(`profile ${name}`, v, max) : "(empty)"}`;
  return [
    "Score this LinkedIn profile against the rubric below, then rewrite the parts that lose points. A profile is not a resume: it answers \"should I message this person\" in about four seconds, from the headline and the first two lines of the about.",
    "Be honest: most first-pass profiles land in the 30s and 40s, and a generous score helps nobody. An empty section scores 0.",
    `Written items to score (score each from 0 to its points):\n${rubricText}`,
    `Already scored from the person's answers (do not score these): photo ${facts.photo.score}/6, activity ${facts.activity.score}/10, contact ${facts.contact.score}/6, recommendations ${facts.recommendations.score}/8.`,
    `Rewrites in ${LANG[language] ?? "English"}, in the person's voice, about what they actually do (use the brand profile and approved facts above). Never invent a number, client or result: write {{your number}} where one is needed and unknown. No "passionate", "results-driven", third-person bio, or opening with their own name. No long dashes.`,
    `Headline (${p.headline.length} characters, limit 220):\n${p.headline ? wrapUntrusted("profile headline", p.headline, 400) : "(empty)"}`,
    `About (${p.about.length} characters):\n${p.about ? wrapUntrusted("profile about", p.about, 3000) : "(empty)"}`,
    field("current role", p.currentRole, 3000), field("previous roles", p.pastRoles, 4000), field("featured section", p.featured, 1000),
    field("banner", p.banner, 300), field("top skills", p.topSkills, 300),
    "Call score_linkedin_profile once.",
  ].join("\n\n");
}
