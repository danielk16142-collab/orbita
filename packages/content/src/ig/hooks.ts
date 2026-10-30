/**
 * Hook scoring and formula matching. Ported from hookscore.py in instagram-agent-skill (Jake Schincariol, MIT).
 *
 * Five local heuristics on the first line of a reel. They catch greetings, preambles, hooks with nothing concrete in them and hooks that
 * take five seconds to say; they do NOT predict views. English word lists: other languages get length/format checks only meaningfully.
 */
import hooksData from "./data/hooks.json";
import { clamp, mean, pyRegex, words } from "./text";

export type Formula = { id: number; name: string; template: string; example: string; on_screen: string; best_for: string; trap: string; match: string };
export const HOOK_FORMULAS = (hooksData as unknown as { hooks: Formula[] }).hooks;
const ORDER = (hooksData as unknown as { classify_order?: number[] }).classify_order ?? HOOK_FORMULAS.map((h) => h.id);
const MATCHERS = ORDER.map((id) => HOOK_FORMULAS.find((h) => h.id === id)).filter((h): h is Formula => !!h).map((h) => ({ id: h.id, name: h.name, re: pyRegex(h.match, "i") }));

/** The first formula (in the classification order of the skill) whose pattern matches the hook, or null. */
export function classifyHook(hook: string): { id: number; name: string } | null {
  for (const m of MATCHERS) if (m.re.test(hook)) return { id: m.id, name: m.name };
  return null;
}

const NUMBER_SRC = "\\$\\s?\\d[\\d,]*(?:\\.\\d+)?|\\b\\d[\\d,]*(?:\\.\\d+)?\\s?(?:%|k\\b|x\\b|hrs?\\b|hours?\\b|mins?\\b|minutes?\\b|days?\\b|weeks?\\b|months?\\b|years?\\b)?";
const NUMBER_RE = new RegExp(NUMBER_SRC, "gi");
const NUMBER_START = new RegExp(`^(?:${NUMBER_SRC})`, "i");
const PROPER_RE = /(?<!^)\b[A-Z][a-z]{2,}\b/g;
const HASHTAG_RE = /(?:^|\s)#\w+/;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}☀-➿]/u;

const set = (s: string) => new Set(s.split(/\s+/));
const SPOKEN_NUMBERS = set("zero two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen half twice triple");
const MONEY_WORDS = set("dollars dollar bucks grand percent cents millionaire billionaire revenue profit salary rent");
const STAKES = set("stop never wrong mistake mistakes lost lose losing cost costs broke broken failed failure fail nobody no not don't dont doesn't didn't can't won't quit quitting fired deleted delete killed kills kill replaced replaces cut beat free paid charged hired saved first banned illegal worst hate hated wasted waste scam lie lied lying truth secret hidden stole stolen before until instead but except unless problem risk danger warning regret wish should shouldn't still already only without versus vs actually");
const WEAK_OPENERS = ["so", "ok", "okay", "hey", "hi", "hello", "guys", "yo", "alright", "welcome", "today", "basically", "honestly", "look", "listen", "um", "just", "let", "lets", "let's", "i wanted", "i want", "one of", "have you", "did you", "do you", "are you", "in this", "in today", "the thing", "a lot", "there is", "there are", "this is", "it is", "as a", "when it", "if you've", "you know"];
const IMPERATIVES = set("stop steal copy delete try watch read save use build make write send take start quit never always don't dont do put run check");

const DEALBREAKERS: [RegExp, string][] = [
  [/^\s*(?:stop scrolling|don'?t scroll)/i, 'Opens with "stop scrolling". Asking for attention proves you have not earned it.'],
  [/\b(?:in (?:this|today'?s) (?:video|reel)|i'?m going to show you|i'?ll show you how)\b/i, "Video preamble. Delete it and open on the payoff."],
  [/^\s*(?:hey |hi |what'?s up |welcome )/i, "Greeting. Nobody came to the feed to be greeted."],
  [HASHTAG_RE, "Hashtag in the hook. Hashtags belong at the bottom of the caption, if anywhere."],
  [EMOJI_RE, "Emoji in the hook. On-screen text at hook size has room for words or for an emoji, not both."],
];

type Check = { score: number; detail: string };
const strip = (w: string) => w.toLowerCase().replace(/^['’]+|['’]+$/g, "");
const f1 = (n: number) => n.toFixed(1);

function checkLength(text: string): Check {
  const n = words(text).length;
  const secs = n / 2.75; // ~165 words per minute, spoken
  const chars = text.trim().length;
  let score = n >= 5 && n <= 12 ? 100 : n < 5 ? clamp(100 - (5 - n) * 20) : clamp(100 - (n - 12) * 11);
  if (chars > 60) score -= 12;
  return { score: clamp(score), detail: `${n} words, ${chars} chars, ~${f1(secs)}s spoken (want 5-12 words)` };
}

function checkSpecificity(text: string): Check {
  const nums = (text.match(NUMBER_RE) ?? []).map((n) => n.trim()).filter(Boolean);
  const propers = [...new Set(text.match(PROPER_RE) ?? [])];
  const spoken = words(text).map(strip).filter((w) => SPOKEN_NUMBERS.has(w) || MONEY_WORDS.has(w));
  const hits = nums.length + propers.length + spoken.length;
  const score = hits === 0 ? 15 : clamp(45 + hits * 30);
  const found = [...nums.slice(0, 2), ...propers.sort().slice(0, 2), ...spoken.slice(0, 2)].join(", ");
  return { score, detail: `${hits} concrete marker(s)` + (found ? `: ${found}` : " - no number, no name, nothing checkable") };
}

function checkStakes(text: string): Check {
  const markers = [...new Set(words(text).map(strip).filter((w) => STAKES.has(w)))].sort();
  if (/\$\s?\d/.test(text)) markers.push("a price");
  const n = markers.length;
  const score = n === 0 ? 20 : n === 1 ? 70 : 100;
  return { score, detail: `${n} tension marker(s)` + (n ? `: ${markers.slice(0, 4).join(", ")}` : " - nothing is at stake in this line") };
}

function checkFrontload(text: string): Check {
  const w = words(text);
  if (!w.length) return { score: 0, detail: "empty" };
  const low = w.map(strip);
  const opener = low.slice(0, 2).join(" ");
  let penalty = 0, hit: string | null = null;
  for (const weak of WEAK_OPENERS) if (opener.startsWith(weak) || low[0] === weak) { penalty = 30; hit = weak; break; }
  // Upstream also treats a capitalised word after the first as payload, but its regex can never match a lone word; kept out for score parity.
  const payload = low.findIndex((t, i) => STAKES.has(t) || SPOKEN_NUMBERS.has(t) || MONEY_WORDS.has(t) || NUMBER_START.test(w[i]));
  let base: number, where: string;
  if (payload < 0) { base = 30; where = "no payload word anywhere in the line"; }
  else if (payload <= 3) { base = 100; where = `payload at word ${payload + 1}`; }
  else if (payload <= 6) { base = 70; where = `payload at word ${payload + 1}, could move forward`; }
  else { base = 40; where = `payload at word ${payload + 1}, too late`; }
  return { score: clamp(base - penalty), detail: where + (hit ? `; weak opener "${hit}"` : "") };
}

function checkAddress(text: string): Check {
  const low = text.toLowerCase();
  const w = words(text).map(strip);
  if (/\b(you|your|you're|youre|yourself)\b/.test(low)) return { score: 100, detail: "speaks to the viewer" };
  if (w.length && IMPERATIVES.has(w[0])) return { score: 90, detail: `imperative opener ("${w[0]}")` };
  if (/\b(i|my|me|we|our)\b/.test(low)) return { score: 70, detail: "first person, no viewer named" };
  return { score: 35, detail: "third person, nobody in the room" };
}

export const HOOK_CHECKS = ["LENGTH", "SPECIFICITY", "STAKES", "FRONTLOAD", "ADDRESS"] as const;
export type HookCheck = (typeof HOOK_CHECKS)[number];
export type HookScore = { hook: string; checks: Record<HookCheck, Check>; weakest: HookCheck; flags: string[]; score: number; verdict: "STRONG" | "OK" | "WEAK"; formula: { id: number; name: string } | null };

export function scoreHook(hook: string): HookScore {
  const checks = { LENGTH: checkLength(hook), SPECIFICITY: checkSpecificity(hook), STAKES: checkStakes(hook), FRONTLOAD: checkFrontload(hook), ADDRESS: checkAddress(hook) };
  const flags = DEALBREAKERS.filter(([re]) => re.test(hook)).map(([, msg]) => msg);
  const scores = HOOK_CHECKS.map((c) => checks[c].score);
  // The weakest property caps the hook: one bad property is enough for the thumb to keep moving.
  const score = clamp(mean(scores) * 0.6 + Math.min(...scores) * 0.4 - flags.length * 15);
  const verdict = score >= 70 && Math.min(...scores) >= 55 && !flags.length ? "STRONG" : score >= 50 ? "OK" : "WEAK";
  const weakest = HOOK_CHECKS.reduce((a, b) => (checks[b].score < checks[a].score ? b : a));
  return { hook, checks, weakest, flags, score: Math.round(score * 10) / 10, verdict, formula: classifyHook(hook) };
}

/** Best first. Empty lines are ignored. */
export const rankHooks = (hooks: string[]): HookScore[] => hooks.map((h) => h.trim()).filter(Boolean).map(scoreHook).sort((a, b) => b.score - a.score);
