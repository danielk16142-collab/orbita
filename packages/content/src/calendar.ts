/** Calendar math on ISO dates (YYYY-MM-DD). Planned dates are client-local calendar days, so no timezone arithmetic is needed. */
export const VIEWS = ["month", "week", "day"] as const;
export type View = (typeof VIEWS)[number];

const parse = (s: string) => new Date(`${s}T12:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const validDate = (s: string | null | undefined): s is string => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parse(s);
  return !Number.isNaN(d.getTime()) && iso(d) === s; // rejects 2026-02-30 (rolls over) and 2026-13-01 (invalid)
};
export const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export function addMonths(s: string, n: number): string {
  const d = parse(s), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}
/** Monday-first by default. */
export function startOfWeek(s: string, weekStartsOn: 0 | 1 = 1): string {
  const dow = parse(s).getUTCDay(); // 0 = Sunday
  return addDays(s, -((dow - weekStartsOn + 7) % 7));
}

/** Weeks (arrays of 7 ISO dates) covering the month of `anchor`, including the days of neighbouring months that fill the first and last week. */
export function monthGrid(anchor: string, weekStartsOn: 0 | 1 = 1): { weeks: string[][]; month: number; year: number } {
  const a = parse(anchor), y = a.getUTCFullYear(), m = a.getUTCMonth();
  const first = iso(new Date(Date.UTC(y, m, 1, 12))), last = iso(new Date(Date.UTC(y, m + 1, 0, 12)));
  const weeks: string[][] = [];
  for (let w = startOfWeek(first, weekStartsOn); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return { weeks, month: m, year: y };
}

/** Inclusive date range shown by a view. */
export function rangeFor(view: View, anchor: string, weekStartsOn: 0 | 1 = 1): { from: string; to: string } {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") { const f = startOfWeek(anchor, weekStartsOn); return { from: f, to: addDays(f, 6) }; }
  const g = monthGrid(anchor, weekStartsOn); return { from: g.weeks[0][0], to: g.weeks[g.weeks.length - 1][6] };
}
export function navigate(view: View, anchor: string, dir: -1 | 1): string {
  return view === "day" ? addDays(anchor, dir) : view === "week" ? addDays(anchor, 7 * dir) : addMonths(anchor, dir);
}

/** Group by planned date; within a day, earlier suggested times first and posts without a time last. */
export function groupByDate<T extends { planned_date: string | null; suggested_time: string | null }>(posts: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of posts) if (p.planned_date) m.set(p.planned_date, [...(m.get(p.planned_date) ?? []), p]);
  for (const [k, v] of m) m.set(k, v.sort((a, b) => (a.suggested_time ?? "99:99").localeCompare(b.suggested_time ?? "99:99")));
  return m;
}

/** The instant a local date+time in an IANA timezone corresponds to (used when a post is scheduled). Falls back to UTC for an unknown zone. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [h, mi] = (time || "09:00").split(":").map(Number);
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, mi);
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const parts = (t: number) => Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, Number(p.value)]));
    const asLocal = (t: number) => { const p = parts(t); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); };
    let t = guess - (asLocal(guess) - guess); // first estimate of the offset
    t = guess - (asLocal(t) - t);             // second pass handles daylight-saving boundaries
    return new Date(t);
  } catch { return new Date(guess); }
}
export const isTimeZone = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz.length > 0 && tz.length <= 64; } catch { return false; } };
