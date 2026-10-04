export type ExportRow = { date: string | null; time: string | null; client: string; network: string; format: string; status: string; language: string; pillar: string | null; idea: string | null; caption: string | null; hashtags: string[] };

const COLUMNS: [keyof ExportRow, string][] = [["date", "Date"], ["time", "Time"], ["client", "Client"], ["network", "Network"], ["format", "Format"], ["status", "Status"], ["language", "Language"], ["pillar", "Pillar"], ["idea", "Idea"], ["caption", "Caption"], ["hashtags", "Hashtags"]];

/** A cell starting with = + - @ (or a tab/CR) is run as a formula by spreadsheets: prefix an apostrophe so text stays text. */
export function safeCell(v: unknown): string {
  let t = Array.isArray(v) ? v.map((h) => `#${h}`).join(" ") : v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** RFC 4180 CSV with a UTF-8 byte order mark so Excel opens accents correctly. */
export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.map(([, h]) => h).join(","), ...rows.map((r) => COLUMNS.map(([k]) => safeCell(r[k])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
