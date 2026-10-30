/**
 * Competitor "what is working": rank recorded posts by how far each beat its own account, and name the hook formula behind it.
 * Ported from swipe.py in instagram-agent-skill (Jake Schincariol, MIT). Pure: the numbers are whatever a person recorded.
 */
import { classifyHook, HOOK_FORMULAS } from "./hooks";
import { median } from "./text";

export type WinPost = {
  id: string; competitorId: string; hook: string; url?: string | null; views?: number | null; likes?: number | null; comments?: number | null; shares?: number | null;
  followers?: number | null; postedAt?: string | null; formulaId?: number | null;
};
export type RankedWin = WinPost & { metric: "views" | "engagement"; value: number; baseline: number | null; multiple: number | null; formula: { id: number; name: string } | null };

/** The number a post is compared on: views when recorded, otherwise likes + comments + shares. Null when nothing was recorded. */
export function postValue(p: WinPost): { metric: "views" | "engagement"; value: number } | null {
  if (p.views != null && p.views > 0) return { metric: "views", value: p.views };
  const e = (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
  return e > 0 ? { metric: "engagement", value: e } : null;
}

const MIN_FOR_BASELINE = 3; // fewer recorded posts than this and a "median" says nothing

/**
 * Each post's multiple of its own competitor's median (same metric). With fewer than three comparable posts there is no baseline:
 * the multiple is null and posts sort by raw value after the ones that have one.
 */
export function rankWins(posts: WinPost[]): RankedWin[] {
  const byComp = new Map<string, WinPost[]>();
  for (const p of posts) byComp.set(p.competitorId, [...(byComp.get(p.competitorId) ?? []), p]);
  const out: RankedWin[] = [];
  for (const p of posts) {
    const v = postValue(p);
    if (!v) continue;
    const peers = (byComp.get(p.competitorId) ?? []).map(postValue).filter((x) => x && x.metric === v.metric).map((x) => x!.value);
    const baseline = peers.length >= MIN_FOR_BASELINE ? median(peers) : null;
    const known = p.formulaId ? HOOK_FORMULAS.find((f) => f.id === p.formulaId) : null;
    const formula = known ? { id: known.id, name: known.name } : classifyHook(p.hook);
    out.push({ ...p, ...v, baseline, multiple: baseline ? Math.round((v.value / baseline) * 10) / 10 : null, formula });
  }
  return out.sort((a, b) => (b.multiple ?? -1) - (a.multiple ?? -1) || b.value - a.value);
}

/** Formulas ordered by how many of the top posts used them (for "what to shoot next"). */
export function topFormulas(ranked: RankedWin[], n = 5) {
  const count = new Map<string, number>();
  for (const r of ranked.slice(0, 20)) if (r.formula) count.set(r.formula.name, (count.get(r.formula.name) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, uses]) => ({ name, uses }));
}

export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));

/**
 * Bulk paste: one post per line, tab- or pipe-separated as `views | likes | hook` (numbers may use K/M and commas), or just a hook.
 * Lines starting with # are ignored. Returns what was understood; nothing is guessed.
 */
export function parseWinsText(raw: string): { hook: string; views: number | null; likes: number | null }[] {
  const num = (s: string) => {
    const m = /^\s*([\d.,]+)\s*([kKmM])?\s*$/.exec(s);
    if (!m) return undefined;
    const base = parseFloat(m[1].replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(base) ? Math.round(base * (m[2] ? (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : 1)) : undefined;
  };
  const rows: { hook: string; views: number | null; likes: number | null }[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
    const cells = line.split(/\t|\s\|\s/).map((c) => c.trim());
    const views = cells.length >= 2 ? num(cells[0]) : undefined;
    const likes = cells.length >= 3 ? num(cells[1]) : undefined;
    const hook = (cells.length >= 3 && likes !== undefined ? cells.slice(2) : cells.length >= 2 && views !== undefined ? cells.slice(1) : cells).join(" ").trim();
    if (hook) rows.push({ hook: hook.slice(0, 300), views: views ?? null, likes: likes ?? null });
  }
  return rows.slice(0, 30);
}

export function swipeMarkdown(ranked: RankedWin[], names: Record<string, string> = {}): string {
  const lines = ["# Swipe file", ""];
  for (const r of ranked.slice(0, 30)) {
    lines.push(`- **${r.multiple ? `${r.multiple}x` : compact(r.value)}** ${names[r.competitorId] ?? ""}: "${r.hook}"${r.formula ? ` _(${r.formula.name})_` : ""}${r.url ? ` ${r.url}` : ""}`);
  }
  return lines.join("\n") + "\n";
}
