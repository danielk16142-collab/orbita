/**
 * Pre-send review of a post: hook ranking, reel beat sheet, caption lint and an AI-sound check, plus a text cleaner that applies the
 * humanizer to every text field of the post. Pure functions, browser-safe. Built on the ports of instagram-agent-skill (MIT).
 */
import { parseContent } from "../schemas";
import { analyseBeats, type BeatSheet } from "./beats";
import { lintCaption, type CaptionLint } from "./caption";
import { cleanText, detectAi, totalRemoved, type AiReport, type CleanOptions } from "./humanize";
import { rankHooks, type HookScore } from "./hooks";

export type ReviewInput = { type: string; language: string; caption: string | null; hashtags: string[] | null; content: unknown };
export type PostReview = {
  language: string;
  /** Reel hook options, or the first slide title / headline for carousels and static posts. */
  hooks: HookScore[];
  beats: BeatSheet | null;
  caption: CaptionLint | null;
  ai: AiReport | null;
  /** Machine artefacts the cleaner would remove (invisible characters, em dashes, stock words ...). */
  artefacts: number;
  /** The heuristics are tuned for English; other languages get typography and format checks only. */
  englishOnly: boolean;
};

type Content = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Every text the audience reads or hears, in reading order. */
function spokenTexts(type: string, c: Content | null): string[] {
  if (!c) return [];
  if (type === "reel") return [...(c.hook_options as string[]).slice(0, 1), ...(c.scenes as Content[]).map((s) => str(s.voiceover)), str(c.cta)].filter(Boolean);
  if (type === "carousel") return [...(c.slides as Content[]).flatMap((s) => [str(s.title), str(s.body)]), str(c.cta)].filter(Boolean);
  if (type === "static") return [str(c.headline), str(c.cta)].filter(Boolean);
  return [];
}

export function reviewPost(p: ReviewInput): PostReview {
  const parsed = parseContent(p.type, p.content);
  const c = parsed.ok ? (parsed.value as Content | null) : null;
  const hookLines = !c ? [] : p.type === "reel" ? (c.hook_options as string[]) : p.type === "carousel" ? [str((c.slides as Content[])[0]?.title)] : p.type === "static" ? [str(c.headline)] : [];
  const beats = p.type === "reel" && c ? analyseBeats(spokenTexts("reel", c).join("\n"), { target: Number(c.duration_seconds) || undefined }) : null;
  const caption = p.caption || p.hashtags?.length ? lintCaption(p.caption ?? "", { hashtags: p.hashtags ?? [] }) : null;
  const all = [p.caption ?? "", ...spokenTexts(p.type, c)].filter(Boolean);
  const english = p.language === "en";
  const ai = all.length ? detectAi(all.join("\n\n")) : null;
  const artefacts = all.reduce((n, t) => n + totalRemoved(cleanText(t, { lang: p.language }).report), 0);
  return { language: p.language, hooks: rankHooks(hookLines), beats, caption, ai, artefacts, englishOnly: !english };
}

/** Apply `fn` to every text field of a post's structured content (hooks, voiceover, on-screen text, slides, headline, CTA). */
export function mapContentText(type: string, content: unknown, fn: (t: string) => string): unknown {
  const parsed = parseContent(type, content);
  if (!parsed.ok || !parsed.value) return content;
  const c = structuredClone(parsed.value) as Content;
  const f = (v: unknown) => (typeof v === "string" && v ? fn(v) : v);
  if (type === "reel") {
    c.hook_options = (c.hook_options as string[]).map((h) => fn(h));
    c.scenes = (c.scenes as Content[]).map((s) => ({ ...s, voiceover: f(s.voiceover), on_screen_text: f(s.on_screen_text) }));
    c.cta = f(c.cta);
  } else if (type === "carousel") {
    c.slides = (c.slides as Content[]).map((s) => ({ ...s, title: f(s.title), body: f(s.body) }));
    c.cta = f(c.cta);
  } else if (type === "static") { c.headline = f(c.headline); c.cta = f(c.cta); }
  return c;
}

/**
 * Clean caption and content text. Returns the new values and how many artefacts were removed; nothing changes if the cleaned text would be empty.
 * Hashtags are left alone.
 */
export function cleanPost(p: { type: string; language: string; caption: string | null; content: unknown }, opts: CleanOptions = {}) {
  let removed = 0;
  const run = (t: string) => { const r = cleanText(t, { lang: p.language, ...opts }); removed += totalRemoved(r.report); return r.text || t; };
  const caption = p.caption ? run(p.caption) : p.caption;
  const content = mapContentText(p.type, p.content, run);
  return { caption, content, removed };
}
