/**
 * Shared text helpers for the Instagram review tools (hooks, beats, caption, humanizer).
 *
 * Ported from instagram-agent-skill by Jake Schincariol (MIT, https://github.com/Jakeschincariol/instagram-agent-skill).
 * The heuristics are tuned for English; typography and invisible-character checks work in every language.
 */
import slopData from "./data/slop.json";

export const WORD_RE = /[A-Za-z0-9$%'’-]+/g;
const clean = (t: string) => t.replace(/(?<=\d),(?=\d)/g, "");

/** "$18,000" is one word when spoken, so it is one word here too. */
export const words = (text: string): string[] => clean(text).match(WORD_RE) ?? [];

export const clamp = (n: number) => Math.max(0, Math.min(100, n));
export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const pstdev = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
export const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

/** A Python regex source from the lexicon files, as a JS RegExp: leading (?ims) flags and \UXXXXXXXX escapes are translated. */
export function pyRegex(src: string, extraFlags = ""): RegExp {
  let flags = "u" + extraFlags;
  const m = /^\(\?([a-z]+)\)/.exec(src);
  if (m) { src = src.slice(m[0].length); for (const f of m[1]) if (!flags.includes(f)) flags += f; }
  src = src.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h: string) => `\\u{${h.replace(/^0+/, "") || "0"}}`).replace(/\\([\s"'`,:;!<>=@#%&~])/g, "$1");
  return new RegExp(src, flags);
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Slop = {
  invisible: { cp: string; name: string; action: "delete" | "space" }[];
  typographic: { from: string; name: string; to: string }[];
  words: { find: string; replace: string; family: string }[];
  phrases: { find: string; replace: string; family: string }[];
  structures: { id: string; name: string; regex: string; fix: string }[];
};
export const SLOP = slopData as unknown as Slop;
