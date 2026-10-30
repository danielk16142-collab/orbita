/**
 * Humanizer: strips the machine fingerprint from a draft and scores how machine-written it looks.
 * Ported from humanize.py and detect.py in instagram-agent-skill (Jake Schincariol, MIT). Everything runs locally.
 *
 * Passes: invisible characters, typography (em dash, curly quotes), then the stock-vocabulary lexicon (English only).
 * Structural tells are reported, never auto-rewritten. `extraTerms` lets a client's "never say" list join the lexicon.
 */
import { clamp, escapeRe, mean, pstdev, pyRegex, SLOP, words } from "./text";

const URL_RE = /https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g;
const SENT_RE = /[^.!?\n]+[.!?]*/g;
const cpOf = (spec: string): [number, number] => { const [a, b] = spec.split("-").map((s) => parseInt(s.replace(/^U\+/, ""), 16)); return [a, b ?? a]; };
const hex = (n: number) => `\\u{${n.toString(16)}}`;

export type CleanReport = { invisible: { name: string; count: number }[]; typographic: { name: string; count: number }[]; lexical: { find: string; replace: string; count: number; family: string }[]; structures: { name: string; count: number; fix: string }[] };
export type CleanOptions = { lang?: string; extraTerms?: string[] };

function protectUrls(text: string): [string, string[]] {
  const found: string[] = [];
  return [text.replace(URL_RE, (m) => { found.push(m); return `\x00URL${found.length - 1}\x00`; }), found];
}
const restoreUrls = (text: string, found: string[]) => found.reduce((t, u, i) => t.replace(`\x00URL${i}\x00`, () => u), text);

function passInvisible(text: string) {
  const hits: CleanReport["invisible"] = [];
  for (const e of SLOP.invisible) {
    const [lo, hi] = cpOf(e.cp);
    const re = new RegExp(lo === hi ? hex(lo) : `[${hex(lo)}-${hex(hi)}]`, "gu");
    const n = (text.match(re) ?? []).length;
    if (n) { hits.push({ name: `${e.cp} ${e.name}`, count: n }); text = text.replace(re, e.action === "delete" ? "" : " "); }
  }
  const stray = text.match(/\p{Cf}/gu);
  if (stray) { hits.push({ name: "other invisible format chars", count: stray.length }); text = text.replace(/\p{Cf}/gu, ""); }
  return { text, hits };
}

function passTypographic(text: string) {
  const hits: CleanReport["typographic"] = [];
  for (const e of SLOP.typographic) {
    const n = text.split(e.from).length - 1;
    if (!n) continue;
    hits.push({ name: `${e.from} ${e.name}`, count: n });
    if (e.from === "—") text = text.replace(/\s*—\s*/g, ", ");
    else if (e.from === "–") text = text.replace(/\s*–\s*(?=\d)/g, "-").replace(/\s+–\s+/g, ", ").replaceAll("–", "-");
    else text = text.replaceAll(e.from, e.to);
  }
  text = text.replace(/,\s*([,.;:!?])/g, "$1").replace(/,[ \t]*\n/g, "\n");
  return { text, hits };
}

function matchCase(src: string, repl: string) {
  if (!repl) return repl;
  if (src === src.toUpperCase() && src.length > 1 && /[A-Z]/.test(src)) return repl.toUpperCase();
  if (/^[A-Z]/.test(src)) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}
const termRe = (find: string) => new RegExp(`\\b${escapeRe(find).replace(/ /g, "\\s+")}\\b`, "gi");

function passLexical(text: string, extra: string[]) {
  const hits: CleanReport["lexical"] = [];
  const entries = [...SLOP.phrases, ...SLOP.words, ...extra.map((find) => ({ find, replace: "", family: "client" }))].sort((a, b) => b.find.length - a.find.length);
  for (const e of entries) {
    const re = termRe(e.find);
    const n = (text.match(re) ?? []).length;
    if (!n) continue;
    hits.push({ find: e.find, replace: e.replace || "(deleted)", count: n, family: e.family });
    text = text.replace(re, (m) => matchCase(m, e.replace));
  }
  // Tidy what deletions leave behind: orphaned punctuation, doubled spaces, blank-line runs.
  text = text.replace(/[ \t]{2,}/g, " ").replace(/^[ \t]*(?:[,.;:]+[ \t]*)+/gm, "").replace(/^[ \t](?=\S)/gm, "")
    .replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/\.\.\./g, "\x00ELL\x00").replace(/\.\s*\.+/g, ".").replace(/([!?])\s*\./g, "$1").replace(/\x00ELL\x00/g, "...")
    .replace(/^[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n")
    .replace(/,\s*(also|so|still|basically|in the end)\s*,\s*/gi, (_, w: string) => `. ${w[0].toUpperCase()}${w.slice(1)}, `);
  return { text, hits };
}

function structures(text: string): CleanReport["structures"] {
  const flags: CleanReport["structures"] = [];
  for (const s of SLOP.structures) {
    let re: RegExp;
    try { re = pyRegex(s.regex, "gm"); } catch { continue; }
    const n = (text.match(re) ?? []).length;
    if (n) flags.push({ name: s.name, count: n, fix: s.fix });
  }
  const lens = (text.match(SENT_RE) ?? []).map((s) => s.trim().split(/\s+/).length).filter((n) => n > 2);
  if (lens.length >= 4) {
    const m = mean(lens), cv = m ? pstdev(lens) / m : 0;
    if (cv < 0.35) flags.push({ name: `Uniform sentence length (variation ${cv.toFixed(2)})`, count: lens.length, fix: "Break one sentence in half. Let another run long. Machines write even." });
  }
  return flags;
}

/** Deleting an opener leaves the next word lower case; only repair it for writers who capitalise sentences to begin with. */
function restoreCapitals(original: string, text: string) {
  const starts = [...original.matchAll(/(?:^|[.!?]\s+|\n)\s*([A-Za-z])/g)].map((m) => m[1]);
  if (!starts.length || starts.filter((c) => c === c.toUpperCase()).length * 2 < starts.length) return text;
  return text.replace(/(?:^|(?<=[.!?] )|(?<=[.!?]\n)|(?<=\n))\s*([a-z])/g, (m, c: string) => m.slice(0, -1) + c.toUpperCase());
}

/** Clean a draft. Typography and invisible characters in every language; the stock-word lexicon only for English. */
export function cleanText(input: string, opts: CleanOptions = {}): { text: string; report: CleanReport } {
  const english = (opts.lang ?? "en") === "en";
  const [protectedText, urls] = protectUrls(input);
  const inv = passInvisible(protectedText);
  const typo = passTypographic(inv.text);
  const extra = (opts.extraTerms ?? []).map((t) => t.trim()).filter(Boolean);
  // Non-English text still honours the client's own never-say terms, but skips the English lexicon.
  const body = english ? passLexical(typo.text, extra) : passLexicalExtraOnly(typo.text, extra);
  const text = restoreUrls(restoreCapitals(input, body.text), urls).trim();
  return { text, report: { invisible: inv.hits, typographic: typo.hits, lexical: body.hits, structures: english ? structures(body.text) : [] } };
}

function passLexicalExtraOnly(text: string, extra: string[]) {
  const hits: CleanReport["lexical"] = [];
  for (const find of extra.map((t) => t.trim()).filter(Boolean)) {
    const re = termRe(find);
    const n = (text.match(re) ?? []).length;
    if (n) { hits.push({ find, replace: "(deleted)", count: n, family: "client" }); text = text.replace(re, ""); }
  }
  return { text: text.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1"), hits };
}

export const totalRemoved = (r: CleanReport) => [...r.invisible, ...r.typographic, ...r.lexical].reduce((n, h) => n + h.count, 0);

// ---- detection panel (detect.py) ----
const WORD2 = /[A-Za-z']+/g;
const CONTRACTIONS = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;
const PRONOUNS = /\b(i|me|my|mine|we|us|our|you|your)\b/gi;
const NUMBERS = /\b\d[\d,.]*%?\b|\$\d/g;
const PROPER = /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm;
const scale = (v: number, human: number, machine: number) => (human === machine ? 50 : clamp(((v - machine) / (human - machine)) * 100));
const sentenceList = (t: string) => (t.match(SENT_RE) ?? []).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);

export const AI_CHECKS = ["BURSTINESS", "SPECIFICITY", "SLOP DENSITY", "FINGERPRINT", "VOICE"] as const;
export type AiCheck = (typeof AI_CHECKS)[number];
export type AiReport = { checks: Record<AiCheck, { score: number; detail: string }>; humanScore: number; verdict: "PASS" | "REVIEW" | "FLAGGED" };

export function detectAi(text: string): AiReport {
  const w = text.match(WORD2) ?? [];
  const lens = sentenceList(text).map((s) => s.split(/\s+/).length);
  const tooShort = { score: 50, detail: "too short to judge" };

  let burst = tooShort;
  if (lens.length >= 4) { const m = mean(lens), cv = m ? pstdev(lens) / m : 0; burst = { score: scale(cv, 0.7, 0.22), detail: `variation ${cv.toFixed(2)} across ${lens.length} sentences (want 0.55+)` }; }

  let spec = tooShort;
  if (w.length >= 25) { const hits = (text.match(NUMBERS) ?? []).length + new Set(text.match(PROPER) ?? []).size; const d = (hits * 100) / w.length; spec = { score: scale(d, 6, 0.5), detail: `${hits} concrete markers, ${d.toFixed(1)} per 100 words (want 4+)` }; }

  let slop = { score: 50, detail: "empty" };
  if (w.length) {
    let hits = 0; const found: string[] = [];
    for (const e of [...SLOP.words, ...SLOP.phrases]) { const n = (text.match(termRe(e.find)) ?? []).length; if (n) { hits += n; found.push(e.find); } }
    const d = (hits * 100) / w.length;
    slop = { score: scale(d, 0, 4), detail: `${hits} stock terms, ${d.toFixed(1)} per 100 words` + (found.length ? ` (${found.sort().slice(0, 4).join(", ")}${found.length > 4 ? ", ..." : ""})` : "") };
  }

  const invisible = (text.match(/\p{Cf}/gu) ?? []).length, em = text.split("—").length - 1, curly = (text.match(/[‘’“”]/g) ?? []).length, ellip = text.split("…").length - 1, nbsp = (text.match(/[   ]/g) ?? []).length;
  const per1k = ((invisible * 4 + em * 2 + curly + ellip + nbsp) * 1000) / Math.max(text.length, 1);
  const finger = { score: scale(per1k, 0, 12), detail: `${invisible} invisible, ${em} em dash, ${curly} curly quote, ${ellip} ellipsis, ${nbsp} hard space` };

  let voice = tooShort;
  if (w.length >= 25) {
    const per100 = 100 / w.length;
    const contr = (text.match(CONTRACTIONS) ?? []).length * per100, person = (text.match(PRONOUNS) ?? []).length * per100;
    let tells = 0; const names: string[] = [];
    for (const s of SLOP.structures) { let re: RegExp; try { re = pyRegex(s.regex, "gm"); } catch { continue; } const n = (text.match(re) ?? []).length; if (n) { tells += n; names.push(s.id); } }
    const bullets = [...text.matchAll(/^\s*[-*•]\s+(.+)$/gm)].map((m) => m[1].split(/\s+/).length);
    let score = scale(contr, 3, 0) * 0.35 + scale(person, 8, 1) * 0.35 + clamp(100 - tells * 22) * 0.3;
    if (bullets.length >= 3 && pstdev(bullets) < 1.6) { score -= 12; names.push("uniform-bullets"); }
    voice = { score: clamp(score), detail: `${contr.toFixed(1)} contractions, ${person.toFixed(1)} personal pronouns per 100 words, ${tells} structural tell(s)` + (names.length ? ` [${names.slice(0, 4).join(", ")}]` : "") };
  }

  const checks = { BURSTINESS: burst, SPECIFICITY: spec, "SLOP DENSITY": slop, FINGERPRINT: finger, VOICE: voice };
  const scores = AI_CHECKS.map((c) => checks[c].score);
  const overall = mean(scores) * 0.6 + Math.min(...scores) * 0.4;
  let verdict: AiReport["verdict"] = overall >= 70 && Math.min(...scores) >= 55 ? "PASS" : overall >= 50 ? "REVIEW" : "FLAGGED";
  // Rhythm and specifics are style signals, not proof. With no stock words and no machine characters the text is not "AI-sounding", just improvable.
  if (verdict === "FLAGGED" && checks["SLOP DENSITY"].score >= 90 && checks.FINGERPRINT.score >= 90) verdict = "REVIEW";
  return { checks, humanScore: Math.round(overall * 10) / 10, verdict };
}

/** What to improve, in plain words, for the weakest signals (used to guide a rewrite). */
export function weakSignals(r: AiReport): string[] {
  const out: string[] = [];
  const c = r.checks;
  if (c.BURSTINESS.score < 55) out.push("sentences are all about the same length: mix very short ones with longer ones");
  if (c.SPECIFICITY.score < 55) out.push("little that is concrete: use specific wording already present in the draft or in the approved facts, never invent numbers or names");
  if (c["SLOP DENSITY"].score < 70) out.push("stock vocabulary: replace with plain words");
  if (c.FINGERPRINT.score < 70) out.push("machine typography: no long dashes or curly quotes");
  if (c.VOICE.score < 60) out.push("flat voice: use contractions and speak in first person where it fits");
  return out;
}
