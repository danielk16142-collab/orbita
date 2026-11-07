/**
 * LinkedIn post check: what the feed shows before "see more", and the rules of the li-post skill (linkedin-agent-skill,
 * Jake Schincariol, MIT): the hook alone on line 1 within ~140 characters (mobile), 900-1,300 characters, short paragraphs,
 * at most three hashtags at the bottom, no links in the body (first comment instead), no engagement bait, one close.
 * Returns the same shape as the Instagram caption lint so the Quality check card shows either.
 */
import type { CaptionCheck, CaptionLint } from "../ig/caption";

export const LI_LIMIT = 3000;
export const LI_SEE_MORE = 140;
export const LI_HASHTAG_CAP = 3;

const HASHTAG_RE = /(?:^|\s)(#[\p{L}\p{N}_]+)/gu;
const MENTION_RE = /(?:^|\s)(@[\p{L}\p{N}_.]+)/gu;
const LINK_RE = /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app|ca)\/\S*/gi;
const BAIT_RE = /^(?:thoughts|agree|agreed|right|thoughts below|what do you think|who else|anyone else|am i wrong|yes or no|comment below|let me know (?:your thoughts|in the comments))\s*[?!.]*$/i;
const INSTRUCTION_RE = /\b(?:comment|dm me|message me|follow|repost|share this|save this|click|book|sign up|download|read the|check out|link in the (?:first )?comment)\b/i;
const PLACEHOLDER_RE = /\{\{[^}]+\}\}/;

const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[1] ?? m[0]);

export function lintLinkedInPost(text: string, opts: { hashtags?: string[] } = {}): CaptionLint {
  const extra = (opts.hashtags ?? []).map((t) => `#${t.replace(/^#/, "")}`).filter((t) => t.length > 1);
  const post = (extra.length ? `${text.trimEnd()}\n\n${extra.join(" ")}` : text).trim();
  const chars = post.length;
  const lines = post.split("\n");
  const first = (lines[0] ?? "").trim();
  const paragraphs = post.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const tags = all(HASHTAG_RE, post), mentions = all(MENTION_RE, post), links = post.match(LINK_RE) ?? [];
  const body = paragraphs.filter((p) => !/^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(p));
  const close = (body[body.length - 1] ?? "").split("\n").pop()?.trim() ?? "";
  const visible = chars <= LI_SEE_MORE ? post : post.slice(0, LI_SEE_MORE);
  const checks: CaptionCheck[] = [];
  const add = (check: string, status: CaptionCheck["status"], detail: string) => checks.push({ check, status, detail });

  if (chars > LI_LIMIT) add("LENGTH", "FAIL", `${chars} / ${LI_LIMIT} characters, ${chars - LI_LIMIT} over LinkedIn's limit`);
  else if (chars < 400) add("LENGTH", "WARN", `${chars} characters: under 400 reads as a thought, not a post (900-1,300 is the working range)`);
  else if (chars > 2000) add("LENGTH", "WARN", `${chars} characters: over 2,000 has to earn every line, and line 2 has to pay for the "see more" tap`);
  else add("LENGTH", "PASS", `${chars} characters` + (chars >= 900 && chars <= 1300 ? ", in the 900-1,300 working range" : " (900-1,300 is the working range for a text post)"));

  if (!first) add("HOOK LINE", "FAIL", "the post opens on a blank line");
  else if (/^[#@]/.test(first)) add("HOOK LINE", "FAIL", "opens on a hashtag or a mention, which is the one position worth a sentence");
  else if (first.length > LI_SEE_MORE) add("HOOK LINE", "WARN", `${first.length} characters, so mobile cuts it at about ${LI_SEE_MORE} mid-thought. Put the hook alone on line 1`);
  else add("HOOK LINE", "PASS", `${first.length} characters, survives the mobile cut`);
  if (first.includes("?")) add("HOOK QUESTION", "WARN", "a question in line 1 only works if it is specific enough that only you could ask it");

  const walls = body.filter((p) => p.split("\n").length > 3 || p.length > 320);
  add("WHITE SPACE", walls.length ? "WARN" : "PASS", walls.length ? `${walls.length} paragraph(s) longer than 3 lines. Short paragraphs with a blank line between each: the white space is the format` : `${body.length} short paragraph(s)`);

  if (tags.length > LI_HASHTAG_CAP) add("HASHTAGS", "WARN", `${tags.length} hashtags: three at most, at the bottom, and only real categories someone follows`);
  else add("HASHTAGS", "PASS", `${tags.length} hashtag(s)` + (tags.length ? `: ${tags.join(" ")}` : ""));
  const lastPara = paragraphs[paragraphs.length - 1] ?? "";
  const tagsInBody = tags.filter((t) => !lastPara.includes(t));
  if (tags.length && tagsInBody.length) add("TAG PLACEMENT", "WARN", "hashtags belong at the bottom, not in the body");

  add("LINKS", links.length ? "WARN" : "PASS", links.length ? `${links.length} link(s) in the post. LinkedIn shows posts with outbound links to fewer people: put the link in the first comment and say so` : "no links in the body");

  if (BAIT_RE.test(close)) add("CLOSE", "WARN", `"${close}" is engagement bait. Close with one question only this post could ask, or one instruction`);
  else if (close.includes("?") && INSTRUCTION_RE.test(close)) add("CLOSE", "WARN", "the close asks a question and gives an instruction. Pick one");
  else add("CLOSE", "PASS", close.includes("?") ? "closes on a question" : INSTRUCTION_RE.test(close) ? "closes on one instruction" : "closes on a statement");

  if (PLACEHOLDER_RE.test(post)) add("PLACEHOLDER", "FAIL", "a {{placeholder}} is still in the post: fill in the real number or fact, never invent it");

  const fails = checks.filter((c) => c.status === "FAIL").length, warns = checks.filter((c) => c.status === "WARN").length;
  return { characters: chars, limit: LI_LIMIT, truncateAt: LI_SEE_MORE, visible, truncated: chars > LI_SEE_MORE, hashtags: tags, mentions, links, asks: [], checks, verdict: fails ? "FIX" : warns > 1 ? "REVIEW" : "READY" };
}
