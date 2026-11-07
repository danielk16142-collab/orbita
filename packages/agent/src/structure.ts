import { z } from "zod";
import { wrapUntrusted } from "./untrusted";

/**
 * "Why it works": the structure of one competitor post, read with the Instagram skill's tools (hook formula and score, beat
 * timing) and explained by the agent, then a structure profile of the competitor built from its best posts' breakdowns.
 */
export const PARTS = ["hook", "setup", "value", "proof", "story", "turn", "cta"] as const;
const str = { type: "string" } as const;
export const BREAKDOWN_TOOL = {
  name: "explain_structure", strict: true, description: "Explain why this post works and how it is built. Call it exactly once.",
  input_schema: { type: "object", properties: {
    hook: { type: "object", properties: { formula: { ...str, description: "the hook formula name it uses (from the list), or a short name of your own" }, why: { ...str, description: "why it stops the scroll, in one or two sentences" } }, required: ["formula", "why"], additionalProperties: false },
    structure: { type: "array", items: { type: "object", properties: { part: { type: "string", enum: [...PARTS] }, timing: { ...str, description: "e.g. 0-3s, or empty when unknown" }, what: { ...str, description: "what happens in this part, one line" } }, required: ["part", "timing", "what"], additionalProperties: false } },
    retention: { type: "array", items: str, description: "what keeps people watching or reading (open loop, pattern break, numbered list, on-screen text...)" },
    cta: { type: "object", properties: { kind: { type: "string", enum: ["comment_keyword", "follow", "save", "share", "dm", "link", "question", "none"] }, text: str }, required: ["kind", "text"], additionalProperties: false },
    format: { ...str, description: "format and pacing in one line: length, talking head or b-roll, on-screen text, cuts" },
    why_it_worked: { type: "array", items: str, description: "2 to 4 reasons, tied to the numbers when given" },
    reuse: { type: "array", items: str, description: "2 to 4 things we can reuse (structure, not their words)" },
  }, required: ["hook", "structure", "retention", "cta", "format", "why_it_worked", "reuse"], additionalProperties: false },
} as const;

const line = (max: number) => z.string().catch("").transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));
const lines = (n: number, max: number) => z.array(z.unknown()).catch([]).transform((a) => a.map((x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "")).filter(Boolean).slice(0, n));
export const Breakdown = z.object({
  hook: z.object({ formula: line(80), why: line(400) }).catch({ formula: "", why: "" }),
  structure: z.array(z.unknown()).catch([]).transform((a) => a.flatMap((x) => { const r = z.object({ part: z.enum(PARTS), timing: line(20), what: line(300) }).safeParse(x); return r.success && r.data.what ? [r.data] : []; }).slice(0, 10)),
  retention: lines(6, 200),
  cta: z.object({ kind: z.enum(["comment_keyword", "follow", "save", "share", "dm", "link", "question", "none"]).catch("none"), text: line(200) }).catch({ kind: "none", text: "" }),
  format: line(300),
  why_it_worked: lines(4, 300),
  reuse: lines(4, 300),
  /** Filled by us, not the model: the hook score and formula from the hook tools, and whether a transcript was used. */
  hookScore: z.number().int().min(0).max(100).nullable().optional(),
  hookFormula: z.string().nullable().optional(),
  fromTranscript: z.boolean().optional(),
});
export type Breakdown = z.infer<typeof Breakdown>;

export type PostForBreakdown = {
  network: string; hook: string; caption: string | null; transcript: string | null; multiple: number | null; metric: string; value: number;
  /** From the hook and beat tools (Instagram skill ports). */ formula: string | null; hookScore: number | null; beats: string | null;
};

export function breakdownRequest(p: PostForBreakdown, language: string, formulaNames: string[]): string {
  const LANG: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };
  return [
    `Explain why this ${p.network} post from a competitor works and how it is built, so we can reuse the structure (never the words). Write in ${LANG[language] ?? "English"}.`,
    `Performance: ${p.multiple ? `${p.multiple}x the account's usual ${p.metric}` : `${p.value} ${p.metric}`}.`,
    `Hook tools: ${p.formula ? `formula "${p.formula}"` : "no formula matched"}${p.hookScore != null ? `, hook score ${p.hookScore}/100` : ""}. Known hook formulas: ${formulaNames.join(", ")}.`,
    `Their hook:\n${wrapUntrusted("competitor hook", p.hook, 400)}`,
    p.caption ? `Their caption:\n${wrapUntrusted("competitor caption", p.caption, 2500)}` : "",
    p.transcript ? `What is said in the video:\n${wrapUntrusted("competitor transcript", p.transcript, 8000)}` : "We do not have what is said in the video: work from the hook and the caption, and keep the structure to what they show.",
    p.beats ? `Beat timing of the transcript (estimated from speaking speed):\n${p.beats}` : "",
    "Only describe what is in the post. Call explain_structure once.",
  ].filter(Boolean).join("\n\n");
}

export type StructureProfile = {
  posts: number; withTranscript: number;
  formulas: { name: string; count: number }[];
  structure: { sequence: string; count: number }[];
  ctas: { type: string; count: number }[];
  retention: { device: string; count: number }[];
  avgHookScore: number | null;
};

const count = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

/** A competitor's structure profile from the breakdowns of its best posts: what it repeats. Pure, no model call. */
export function structureProfile(bs: Breakdown[]): StructureProfile {
  const formulas = count(bs.map((b) => b.hookFormula || b.hook.formula).filter(Boolean) as string[]).map(({ k, n }) => ({ name: k, count: n }));
  const structure = count(bs.map((b) => b.structure.map((s) => s.part).filter((p, i, a) => a[i - 1] !== p).join(" > ")).filter(Boolean)).map(({ k, n }) => ({ sequence: k, count: n }));
  const ctas = count(bs.map((b) => b.cta.kind)).map(({ k, n }) => ({ type: k, count: n }));
  const seen = new Map<string, string>();
  const devices = bs.flatMap((b) => [...new Set(b.retention.map((r) => { const key = norm(r).split(" ").slice(0, 4).join(" "); if (!seen.has(key)) seen.set(key, r); return key; }))]);
  const retention = count(devices).slice(0, 6).map(({ k, n }) => ({ device: seen.get(k) ?? k, count: n }));
  const scores = bs.map((b) => b.hookScore).filter((x): x is number => typeof x === "number");
  return { posts: bs.length, withTranscript: bs.filter((b) => b.fromTranscript).length, formulas, structure, ctas, retention, avgHookScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
}
