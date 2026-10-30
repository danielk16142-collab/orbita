/**
 * Caption lint: what the feed shows before "... more", and the checks worth making.
 * Ported from caption.py in instagram-agent-skill (Jake Schincariol, MIT). The 125-character cut is an approximation.
 */
export const CAPTION_LIMIT = 2200;
export const FEED_CUT = 125;
export const HASHTAG_CAP = 5; // Instagram cap per post since Dec 2025

const HASHTAG_RE = /(?:^|\s)(#[A-Za-z0-9_]+)/g;
const MENTION_RE = /(?:^|\s)(@[A-Za-z0-9_.]+)/g;
const LINK_RE = /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app)\/\S*/gi;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}☀-➿←-⇿️]/gu;
const CONCRETE_RE = /\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm;
const ASKS: [RegExp, string][] = [
  [/\bcomment (?:the word |")?[A-Z0-9]{2,}\b/i, "comment a keyword"],
  [/\b(?:dm|message) me\b/i, "DM me"],
  [/\bsave (?:this|it)\b/i, "save this"],
  [/\bshare (?:this|it)\b/i, "share this"],
  [/\bfollow (?:me|for)\b/i, "follow"],
  [/\blink in (?:my )?bio\b/i, "link in bio"],
  [/\b(?:swipe|tap) (?:through|left|right|for|to)\b/i, "swipe or tap"],
  [/\btell me\b|\bwhat would you\b|\bwhich one\b/i, "answer a question"],
];
const FILLER_TAGS = new Set("#viral #fyp #explore #explorepage #foryou #foryoupage #trending #instagood #love #follow #like4like #reels #reelsinstagram #viralreels #instadaily".split(" "));

export type CaptionCheck = { check: string; status: "PASS" | "WARN" | "FAIL"; detail: string };
export type CaptionLint = { characters: number; limit: number; truncateAt: number; visible: string; truncated: boolean; hashtags: string[]; mentions: string[]; links: string[]; asks: string[]; checks: CaptionCheck[]; verdict: "READY" | "REVIEW" | "FIX" };

const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[1] ?? m[0]);

/** `hashtags` are the post's separate tag list (without #): they are appended to the caption the way they will be published. */
export function lintCaption(caption: string, opts: { cut?: number; keywords?: string[]; hashtags?: string[] } = {}): CaptionLint {
  const cut = opts.cut ?? FEED_CUT;
  const extra = (opts.hashtags ?? []).map((t) => `#${t.replace(/^#/, "")}`).filter((t) => t.length > 1);
  const stripped = (extra.length ? `${caption.trimEnd()}\n\n${extra.join(" ")}` : caption).trim();
  const chars = stripped.length;
  const firstLine = (stripped.split("\n")[0] ?? "").trim();
  const tags = all(HASHTAG_RE, stripped), mentions = all(MENTION_RE, stripped), links = stripped.match(LINK_RE) ?? [], emoji = stripped.match(EMOJI_RE) ?? [];
  const visible = chars <= cut ? stripped : stripped.slice(0, cut);
  const asks = ASKS.filter(([re]) => re.test(stripped)).map(([, n]) => n);
  const filler = tags.filter((t) => FILLER_TAGS.has(t.toLowerCase()));
  const keywords = (opts.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const checks: CaptionCheck[] = [];
  const add = (check: string, status: CaptionCheck["status"], detail: string) => checks.push({ check, status, detail });

  add("LENGTH", chars > CAPTION_LIMIT ? "FAIL" : "PASS", `${chars} / ${CAPTION_LIMIT} characters` + (chars > CAPTION_LIMIT ? `, ${chars - CAPTION_LIMIT} over the limit` : ""));

  if (!firstLine) add("FIRST LINE", "FAIL", "the caption opens on a blank line");
  else if (/^[#@]/.test(firstLine)) add("FIRST LINE", "FAIL", "opens on a hashtag or a mention, which is the one position worth a sentence");
  else if (firstLine.length > cut) add("FIRST LINE", "WARN", `${firstLine.length} characters, so it gets cut at ${cut} mid-thought. Fine if the cut is a cliffhanger, bad if it is a subordinate clause`);
  else add("FIRST LINE", "PASS", `${firstLine.length} characters, lands whole`);

  const concrete = visible.match(CONCRETE_RE) ?? [];
  add("HOOK IS CONCRETE", concrete.length ? "PASS" : "WARN", `${concrete.length} number(s) or name(s) in the visible window` + (concrete.length ? "" : " - nothing checkable before the tap"));

  if (tags.length > HASHTAG_CAP) add("HASHTAGS", "FAIL", `${tags.length} tags, over Instagram's cap of ${HASHTAG_CAP}. Tags past the fifth do not count and the block reads as old`);
  else if (tags.length === HASHTAG_CAP && filler.length) add("HASHTAGS", "WARN", `${tags.length} tags, at the cap, and ${filler.length} of them generic. Spend the five on topics`);
  else if (filler.length) add("HASHTAGS", "WARN", `${tags.length} tags, ${filler.length} of them generic (${filler.slice(0, 3).join(", ")}). Those describe nothing`);
  else add("HASHTAGS", "PASS", `${tags.length} tag(s)` + (tags.length ? `: ${tags.join(" ")}` : ""));

  if (!tags.length) add("TAG PLACEMENT", "PASS", "no tags to place");
  else if (tags.some((t) => new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(visible))) add("TAG PLACEMENT", "WARN", "a hashtag is inside the visible window, spending feed space on a label");
  else add("TAG PLACEMENT", "PASS", "tags are below the fold");

  add("LINKS", links.length ? "WARN" : "PASS", links.length ? `${links.length} link(s) in the caption, and captions are not clickable. Move it to the bio or the DM` : "no dead links in the body");

  if (asks.length === 1) add("ONE ASK", "PASS", `one call to action: ${asks[0]}`);
  else if (!asks.length) add("ONE ASK", "WARN", "no call to action. Decide what this post is for");
  else add("ONE ASK", "WARN", `${asks.length} asks (${asks.join(", ")}). Two asks is the same as none`);

  const density = (emoji.length * 100) / Math.max(chars, 1);
  add("EMOJI", density > 4 ? "WARN" : "PASS", `${emoji.length} emoji, ${density.toFixed(1)} per 100 characters` + (density > 4 ? " - reads as decoration" : ""));

  if (keywords.length) {
    const low = stripped.toLowerCase();
    const found = keywords.filter((k) => low.includes(k.toLowerCase())), missing = keywords.filter((k) => !low.includes(k.toLowerCase()));
    const inWindow = found.filter((k) => visible.toLowerCase().includes(k.toLowerCase()));
    add("SEARCH TERMS", !missing.length ? "PASS" : found.length ? "WARN" : "FAIL", `${found.length}/${keywords.length} present` + (found.length ? `, ${inWindow.length} in the visible window` : "") + (missing.length ? `. Missing: ${missing.join(", ")}` : ""));
  }

  const fails = checks.filter((c) => c.status === "FAIL").length, warns = checks.filter((c) => c.status === "WARN").length;
  return { characters: chars, limit: CAPTION_LIMIT, truncateAt: cut, visible, truncated: chars > cut, hashtags: tags, mentions, links, asks, checks, verdict: fails ? "FIX" : warns ? "REVIEW" : "READY" };
}
