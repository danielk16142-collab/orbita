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

/** What a script export needs to know about the post. */
export type ScriptMeta = { title: string; network: string; language: string; date: string | null; caption: string | null; hashtags: string[]; labels: Record<"scene" | "time" | "visual" | "voiceover" | "onScreen" | "hooks" | "cta" | "audio" | "caption" | "hashtags" | "slide" | "titleCol" | "body" | "duration", string> };
type Reel = { duration_seconds: number; hook_options: string[]; scenes: { seconds: string; visual: string; voiceover: string; on_screen_text: string }[]; cta: string; audio_note: string };
type Carousel = { slides: { title: string; body: string; visual: string }[]; cta: string };

const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(safeCell).join(",")).join("\r\n") + "\r\n";

/** A reel or carousel as a sheet: one row per scene (or slide), then hooks, call to action, caption and hashtags. */
export function scriptCsv(type: string, content: unknown, m: ScriptMeta): string {
  const L = m.labels;
  const head: unknown[][] = [[m.title], [[m.network, m.language.toUpperCase(), m.date].filter(Boolean).join(" · ")], []];
  const tail: unknown[][] = [[], [L.caption, m.caption ?? ""], [L.hashtags, m.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")]];
  if (type === "reel") {
    const r = content as Reel;
    return csv([...head, [L.duration, `${r.duration_seconds}s`], [],
      ...r.hook_options.map((h, i) => [i === 0 ? L.hooks : "", h]), [],
      [L.scene, L.time, L.visual, L.voiceover, L.onScreen], ...r.scenes.map((s, i) => [i + 1, s.seconds, s.visual, s.voiceover, s.on_screen_text]), [],
      [L.cta, r.cta], [L.audio, r.audio_note], ...tail]);
  }
  const c = content as Carousel;
  return csv([...head, [L.slide, L.titleCol, L.body, L.visual], ...c.slides.map((s, i) => [i + 1, s.title, s.body, s.visual]), [], [L.cta, c.cta], ...tail]);
}

/** The same as a plain script to read, print or paste into a doc. */
export function scriptText(type: string, content: unknown, m: ScriptMeta): string {
  const L = m.labels;
  const out = [m.title, [m.network, m.language.toUpperCase(), m.date].filter(Boolean).join(" · "), ""];
  if (type === "reel") {
    const r = content as Reel;
    out.push(`${L.duration}: ${r.duration_seconds}s`, "", `${L.hooks}:`, ...r.hook_options.map((h, i) => `${i + 1}. ${h}`), "");
    r.scenes.forEach((s, i) => {
      out.push(`${L.scene} ${i + 1} (${s.seconds})`, `${L.visual}: ${s.visual}`);
      if (s.voiceover) out.push(`${L.voiceover}: ${s.voiceover}`);
      if (s.on_screen_text) out.push(`${L.onScreen}: ${s.on_screen_text}`);
      out.push("");
    });
    out.push(`${L.cta}: ${r.cta}`);
    if (r.audio_note) out.push(`${L.audio}: ${r.audio_note}`);
  } else {
    const c = content as Carousel;
    c.slides.forEach((s, i) => { out.push(`${L.slide} ${i + 1}: ${s.title}`); if (s.body) out.push(s.body); if (s.visual) out.push(`${L.visual}: ${s.visual}`); out.push(""); });
    out.push(`${L.cta}: ${c.cta}`);
  }
  if (m.caption) out.push("", `${L.caption}:`, m.caption);
  if (m.hashtags.length) out.push("", m.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));
  return out.join("\n") + "\n";
}
