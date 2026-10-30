/**
 * Reel beat sheet: how long each line takes to say, and what will lose viewers in the edit.
 * Ported from beats.py in instagram-agent-skill (Jake Schincariol, MIT). Estimates from word count, not a substitute for recording.
 */
import { words } from "./text";

const SENT_RE = /[^.!?]+[.!?]*/g;
const CONCRETE_RE = /\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm;
const STOPWORDS = new Set("the a an and or but if of to in on for with that this it is are was were be been you your i my me we our they them he she so just not no do did does have has had will can at as by from out up off one all".split(" "));
export const HOOK_WINDOW = 3.0; // seconds; past this the thumb has already decided
export const MAX_BEAT = 4.0; // seconds on one idea with no change on screen
const ABSTRACT_RUN = 3; // beats in a row with nothing checkable in them

export type Beat = { n: number; start: number; dur: number; words: number; text: string; concrete: number; label: string; flags: string[] };
export type BeatSheet = { wpm: number; target: number | null; totalSeconds: number; totalWords: number; beats: Beat[]; notes: string[] };

const pretty = (t: string) => t.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
export const timecode = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** One line is one beat, unless a line is too long to be one. */
function splitBeats(raw: string, wps: number): string[] {
  const beats: string[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim())) {
    if (!line) continue;
    if (words(line).length / wps <= MAX_BEAT * 1.5) { beats.push(line); continue; }
    let buf = "";
    for (const part of (line.match(SENT_RE) ?? []).map((p) => p.trim()).filter(Boolean)) {
      const candidate = `${buf} ${part}`.trim();
      if (buf && words(candidate).length / wps > MAX_BEAT) { beats.push(buf); buf = part; } else buf = candidate;
    }
    if (buf) beats.push(buf);
  }
  return beats;
}

export function analyseBeats(raw: string, opts: { wpm?: number; target?: number } = {}): BeatSheet | null {
  const wpm = opts.wpm ?? 165, target = opts.target ?? null;
  const wps = wpm / 60;
  const lines = splitBeats(raw, wps);
  if (!lines.length) return null;
  let clock = 0;
  const rows: Beat[] = lines.map((text, i) => {
    const n = words(text).length, dur = n / wps;
    const row = { n: i + 1, start: round2(clock), dur: round2(dur), words: n, text, concrete: (text.match(CONCRETE_RE) ?? []).length, label: "", flags: [] as string[] };
    clock += dur;
    return row;
  });
  const total = clock;
  for (const r of rows) if (r.n === 1 || r.start + r.dur <= HOOK_WINDOW) r.label = "HOOK";
  rows[rows.length - 1].label = rows[rows.length - 1].label !== "HOOK" ? "CTA" : "HOOK/CTA";
  const half = total / 2;
  for (const r of rows) if (!r.label && r.start <= half && half < r.start + r.dur) r.label = "MID";

  const notes: string[] = [];
  if (rows[0].dur > HOOK_WINDOW) {
    rows[0].flags.push(`hook runs ${rows[0].dur.toFixed(1)}s, past the ${HOOK_WINDOW.toFixed(0)}s mark`);
    notes.push(`Beat 1 takes ${rows[0].dur.toFixed(1)}s to say. Cut it to ${Math.floor(HOOK_WINDOW * wps)} words or fewer, or the hook lands after the decision has been made.`);
  }
  if (rows[0].concrete === 0) notes.push("Beat 1 has no number and no name in it. Hooks without something checkable are the ones that get scrolled.");
  for (const r of rows) if (r.dur > MAX_BEAT) r.flags.push(`${r.dur.toFixed(1)}s on one beat`);
  const long = rows.filter((r) => r.dur > MAX_BEAT).map((r) => r.n);
  if (long.length) notes.push(`Beat(s) ${long.join(", ")} run past ${MAX_BEAT.toFixed(0)}s. Either split the line or change what is on screen inside it. A static frame is where people leave.`);

  let run = 0, start: number | null = null;
  for (const r of rows) {
    if (r.concrete === 0) {
      run++; start = start ?? r.n;
      if (run === ABSTRACT_RUN) notes.push(`Beats ${start}-${r.n} have nothing concrete in them. Put a number, a name or a price in one of them.`);
    } else { run = 0; start = null; }
  }

  const meaningful = (t: string) => new Set(words(t).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w)));
  const first = meaningful(rows[0].text), last = meaningful(rows[rows.length - 1].text);
  const loop = [...first].filter((w) => last.has(w)).map(pretty).sort();
  notes.push(loop.length
    ? `Loops: the last beat repeats "${loop.slice(0, 3).join(", ")}" from the hook. Second watches are free reach.`
    : "No loop. The last beat shares no word with the hook, so the video ends flat. Echoing one word from beat 1 is the cheapest replay you get.");

  if (target) {
    const delta = total - target;
    if (Math.abs(delta) <= target * 0.1) notes.push(`Length is on target (${total.toFixed(1)}s against ${target}s).`);
    else if (delta > 0) notes.push(`${delta.toFixed(1)}s over target. Cut about ${Math.floor(delta * wps)} words.`);
    else notes.push(`${(-delta).toFixed(1)}s under target. Either add ${Math.floor(-delta * wps)} words or shoot it short. Short is usually right.`);
  }
  return { wpm, target, totalSeconds: round2(total), totalWords: rows.reduce((n, r) => n + r.words, 0), beats: rows, notes };
}
