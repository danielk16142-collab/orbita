/**
 * LinkedIn's own analytics export (the .xlsx file from linkedin.com/analytics, "Export"), read without any API: the file is
 * unzipped and its sheets read as plain rows, then the parts we use are found by their headings (DISCOVERY, ENGAGEMENT,
 * TOP POSTS, FOLLOWERS, DEMOGRAPHICS), so small layout changes do not break it. Everything in the file is untrusted text.
 */
import { strFromU8, unzipSync } from "fflate";

export const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
export type Sheet = { name: string; rows: string[][] };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const colIndex = (ref: string) => { const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A"; return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1; };
const texts = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** The sheets of an .xlsx file as rows of text. Throws on anything that is not a readable workbook. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  if (bytes.byteLength > MAX_EXPORT_BYTES) throw new Error("too_large");
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") && /\.(xml|rels)$/.test(f.name) && f.originalSize < 20 * 1024 * 1024 }); }
  catch { throw new Error("not_xlsx"); }
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const workbook = read("xl/workbook.xml");
  if (!workbook) throw new Error("not_xlsx");
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const rels = new Map([...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g)) {
    const target = rels.get(m[2]) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = read(path);
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], inner = c[2] ?? "";
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? `${String.fromCharCode(65 + row.length)}1`;
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? texts(inner) : decode(v ?? "");
        row[colIndex(ref)] = value.trim();
      }
      rows.push(Array.from(row, (x) => x ?? ""));
    }
    sheets.push({ name: decode(m[1]), rows });
  }
  return sheets;
}

export type LinkedInPost = { url: string; date: string | null; engagements: number | null; impressions: number | null };
export type LinkedInSummary = {
  period: { from: string | null; to: string | null };
  impressions: number | null; membersReached: number | null; engagements: number | null; engagementRate: number | null;
  followers: number | null; newFollowers: number | null;
  weeks: { start: string; impressions: number; engagements: number; newFollowers: number }[];
  topPosts: LinkedInPost[];
  demographics: { category: string; value: string; share: number | null }[];
  found: string[];
};

const num = (v: string | undefined) => { if (!v) return null; const n = Number(v.replace(/[,\s%]/g, "")); return Number.isFinite(n) ? n : null; };
/** A date cell: an Excel serial number or M/D/YYYY (LinkedIn's format), as YYYY-MM-DD. */
export function cellDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (/^\d{4,5}(\.\d+)?$/.test(t)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 864e5); return d.toISOString().slice(0, 10); }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}
const sheetNamed = (sheets: Sheet[], re: RegExp) => sheets.find((s) => re.test(s.name));
const findRow = (rows: string[][], test: (r: string[]) => boolean) => rows.findIndex(test);
const has = (r: string[], re: RegExp) => r.some((c) => re.test(c));
const weekStart = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const safeUrl = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && /(^|\.)linkedin\.com$/.test(x.hostname) ? `${x.origin}${x.pathname}`.slice(0, 300) : null; } catch { return null; } };

export function parseLinkedInExport(sheets: Sheet[]): LinkedInSummary {
  const found: string[] = [];
  const out: LinkedInSummary = { period: { from: null, to: null }, impressions: null, membersReached: null, engagements: null, engagementRate: null, followers: null, newFollowers: null, weeks: [], topPosts: [], demographics: [], found };
  const byWeek = new Map<string, { impressions: number; engagements: number; newFollowers: number }>();
  const week = (d: string) => { const k = weekStart(d); if (!byWeek.has(k)) byWeek.set(k, { impressions: 0, engagements: 0, newFollowers: 0 }); return byWeek.get(k)!; };

  const discovery = sheetNamed(sheets, /discovery/i);
  if (discovery) {
    found.push("discovery");
    for (const r of discovery.rows) {
      const label = (r[0] ?? "").toLowerCase();
      if (label.startsWith("impressions")) out.impressions = num(r[1]);
      else if (label.startsWith("members reached")) out.membersReached = num(r[1]);
      else if (/^overall performance/.test(label) && r[1]) {
        const m = /(\d{1,2}\/\d{1,2}\/\d{4})\D+(\d{1,2}\/\d{1,2}\/\d{4})/.exec(r[1]);
        if (m) out.period = { from: cellDate(m[1]), to: cellDate(m[2]) };
      }
    }
  }

  const engagement = sheetNamed(sheets, /engagement/i);
  if (engagement) {
    const h = findRow(engagement.rows, (r) => has(r, /^date$/i) && has(r, /^impressions$/i));
    if (h >= 0) {
      found.push("engagement");
      const cols = engagement.rows[h].map((c) => c.toLowerCase());
      const di = cols.indexOf("date"), ii = cols.indexOf("impressions"), ei = cols.findIndex((c) => c.startsWith("engagement"));
      let imp = 0, eng = 0; const dates: string[] = [];
      for (const r of engagement.rows.slice(h + 1)) {
        const d = cellDate(r[di]); if (!d) continue;
        dates.push(d); const i = num(r[ii]) ?? 0, e = ei >= 0 ? num(r[ei]) ?? 0 : 0;
        imp += i; eng += e; const w = week(d); w.impressions += i; w.engagements += e;
      }
      if (dates.length) {
        dates.sort();
        out.period = { from: out.period.from ?? dates[0], to: out.period.to ?? dates[dates.length - 1] };
        out.impressions = out.impressions ?? imp;
        out.engagements = eng;
      }
    }
  }

  const top = sheetNamed(sheets, /top posts/i);
  if (top) {
    const h = findRow(top.rows, (r) => has(r, /^post url$/i));
    if (h >= 0) {
      found.push("top_posts");
      const head = top.rows[h].map((c) => c.toLowerCase());
      // Two tables side by side: posts by engagements, posts by impressions. Each starts at a "Post URL" column.
      const starts = head.map((c, i) => (c === "post url" ? i : -1)).filter((i) => i >= 0);
      const posts = new Map<string, LinkedInPost>();
      for (const s of starts) {
        const metricCol = s + 2, metric = head[metricCol] ?? "";
        for (const r of top.rows.slice(h + 1)) {
          const url = safeUrl(r[s] ?? ""); if (!url) continue;
          const p = posts.get(url) ?? { url, date: cellDate(r[s + 1]), engagements: null, impressions: null };
          if (metric.startsWith("engagement")) p.engagements = num(r[metricCol]);
          else if (metric.startsWith("impression")) p.impressions = num(r[metricCol]);
          posts.set(url, p);
        }
      }
      out.topPosts = [...posts.values()].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0) || (b.engagements ?? 0) - (a.engagements ?? 0)).slice(0, 10);
    }
  }

  const followers = sheetNamed(sheets, /follower/i);
  if (followers) {
    found.push("followers");
    for (const r of followers.rows.slice(0, 5)) {
      const total = /total followers[^:]*:?\s*$/i.test(r[0] ?? "") ? num(r[1]) : /total followers.*?([\d,]+)\s*$/i.exec(r[0] ?? "") ? num(/total followers.*?([\d,]+)\s*$/i.exec(r[0] ?? "")![1]) : null;
      if (total != null) out.followers = total;
    }
    const h = findRow(followers.rows, (r) => has(r, /^date$/i) && has(r, /new followers/i));
    if (h >= 0) {
      const cols = followers.rows[h].map((c) => c.toLowerCase());
      const di = cols.indexOf("date"), ni = cols.findIndex((c) => c.includes("new followers"));
      let sum = 0;
      for (const r of followers.rows.slice(h + 1)) { const d = cellDate(r[di]); if (!d) continue; const n = num(r[ni]) ?? 0; sum += n; week(d).newFollowers += n; }
      out.newFollowers = sum;
    }
  }

  const demo = sheetNamed(sheets, /demographic/i);
  if (demo) {
    const h = findRow(demo.rows, (r) => has(r, /top demographics/i) || (has(r, /^value$/i) && has(r, /^percentage$/i)));
    if (h >= 0) {
      found.push("demographics");
      for (const r of demo.rows.slice(h + 1)) {
        if (!r[0] || !r[1]) continue;
        const pct = num(r[2]);
        out.demographics.push({ category: r[0].slice(0, 60), value: r[1].slice(0, 120), share: pct == null ? null : pct > 1 ? pct / 100 : pct });
        if (out.demographics.length >= 15) break;
      }
    }
  }

  out.engagementRate = out.impressions && out.engagements != null ? Math.round((out.engagements / out.impressions) * 10000) / 10000 : null;
  out.weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, v]) => ({ start, ...v }));
  return out;
}
