import { engagementRate, type PostRow, type WindowsResult } from "./analytics";
const rateOf = engagementRate;

/**
 * Posting cadence: what to post next and how this week is going against the posting goal.
 * Pure (no I/O). Every date is a client-local calendar day, "YYYY-MM-DD".
 */
export type CadencePost = { id: string; idea: string | null; type: string; network: string; status: string; planned_date: string | null };
export type CadenceRule = { network: string; best_days: string[]; best_time: string };
export type NextPost =
  | { kind: "planned"; post: CadencePost }
  | { kind: "suggestion"; title: string; why: string; source: "strategy" | "research"; day: string; time: string | null; bucket: string | null; network: string | null }
  | { kind: "empty"; day: string };
export type WeekProgress = { weekStart: string; done: number; goal: number; streak: number; daysLeft: number };

const DAY = 86_400_000;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => iso(ms(day) + n * DAY);
const weekday = (day: string) => new Date(ms(day)).getUTCDay();

/** Monday of the week that contains this day. */
export function weekStartOf(day: string): string {
  return addDays(day, -((weekday(day) + 6) % 7));
}

/** Posts published this week against the goal, and how many weeks in a row (before this one) met it. This week counts once it is met. */
export function weekProgress(publishedDays: string[], today: string, goal: number): WeekProgress {
  const start = weekStartOf(today);
  const perWeek = new Map<string, number>();
  for (const d of publishedDays) { const w = weekStartOf(d); perWeek.set(w, (perWeek.get(w) ?? 0) + 1); }
  const done = perWeek.get(start) ?? 0;
  let streak = done >= goal ? 1 : 0;
  for (let w = addDays(start, -7), i = 0; i < 52 && (perWeek.get(w) ?? 0) >= goal; w = addDays(w, -7), i++) streak++;
  return { weekStart: start, done, goal, streak, daysLeft: 7 - ((weekday(today) + 6) % 7) };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
/** True when an idea already on the calendar is about this topic (same opening words). */
const used = (topic: string, ideas: string[]) => { const k = norm(topic).slice(0, 40); return !!k && ideas.some((i) => norm(i).includes(k)); };

/**
 * The next post to work on: the soonest planned one; otherwise a suggestion from the strategy's topic bank (or saved research
 * ideas) that is not on the calendar yet, on the best upcoming day (from the client's results, else the strategy's cadence).
 */
export function nextPost(input: {
  today: string; planned: CadencePost[]; topics: string[]; research: { title: string; summary: string }[]; usedIdeas: string[];
  windows: WindowsResult; cadence: CadenceRule[]; network?: string;
}): NextPost {
  const upcoming = input.planned.filter((p) => p.planned_date && p.planned_date >= input.today && !["published", "failed"].includes(p.status))
    .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!));
  if (upcoming.length) return { kind: "planned", post: upcoming[0] };

  const rule = input.cadence.find((c) => c.network === (input.network ?? "instagram")) ?? input.cadence[0];
  const best = input.windows?.windows ?? [];
  const preferred = best.length ? best.map((w) => w.weekday) : (rule?.best_days ?? []).map((d) => DAY_NAMES.findIndex((n) => n.startsWith(d.toLowerCase().slice(0, 3)))).filter((d) => d >= 0); // "fri" or "friday"
  let day = input.today;
  for (let i = 0; i < 7; i++) { const d = addDays(input.today, i); if (preferred.includes(weekday(d))) { day = d; break; } }
  const bucket = best.find((w) => w.weekday === weekday(day))?.bucket ?? null;
  const time = bucket ? null : rule?.best_time ?? null;

  const weekIndex = Math.floor(ms(weekStartOf(input.today)) / (7 * DAY));
  const topics = input.topics.filter((t) => !used(t, input.usedIdeas));
  if (topics.length) return { kind: "suggestion", title: topics[weekIndex % topics.length], why: "", source: "strategy", day, time, bucket, network: rule?.network ?? null };
  const research = input.research.filter((r) => !used(r.title, input.usedIdeas));
  if (research.length) return { kind: "suggestion", title: research[0].title, why: research[0].summary.slice(0, 200), source: "research", day, time, bucket, network: rule?.network ?? null };
  return { kind: "empty", day };
}

const LIVE = ["idea", "draft", "approved", "scheduled"];

/** The next `horizon` days from today: how many posts are planned, and which days have nothing yet. */
export function weekAhead(planned: CadencePost[], today: string, goal: number, horizon = 7) {
  const days = Array.from({ length: horizon }, (_, i) => addDays(today, i));
  const busy = new Set(planned.filter((p) => p.planned_date && LIVE.includes(p.status)).map((p) => p.planned_date!));
  const count = planned.filter((p) => p.planned_date && LIVE.includes(p.status) && p.planned_date >= today && p.planned_date <= days[horizon - 1]).length;
  const openDays = days.filter((d) => !busy.has(d));
  return { planned: count, goal, short: Math.max(0, goal - count), openDays };
}

/** Planned posts whose day passed in the last 30 days without being scheduled or published. Most recent first. */
export function missedPosts(planned: CadencePost[], today: string): CadencePost[] {
  const from = addDays(today, -30);
  return planned.filter((p) => p.planned_date && p.planned_date < today && p.planned_date >= from && ["idea", "draft", "approved"].includes(p.status))
    .sort((a, b) => b.planned_date!.localeCompare(a.planned_date!));
}

/** Last week (Monday to Sunday) in one line: how many posts went out and which one did best. `localDay` maps an instant to the client's calendar. */
export function lastWeekRecap(posts: PostRow[], today: string, localDay: (iso: string) => string) {
  const start = addDays(weekStartOf(today), -7), end = addDays(start, 6);
  const week = posts.filter((p) => { if (!p.publishedAt) return false; const d = localDay(p.publishedAt); return d >= start && d <= end; });
  const rated = week.map((p) => ({ p, r: p.metrics ? rateOf(p.metrics) : null })).filter((x) => x.r !== null).sort((a, b) => b.r! - a.r!);
  const best = rated[0];
  return { weekStart: start, posts: week.length, best: best ? { caption: (best.p.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 90), permalink: best.p.permalink, rate: best.r!, network: best.p.network } : null };
}
