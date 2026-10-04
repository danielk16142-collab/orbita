import { LIST_SECTIONS, TEXT_SECTIONS, type BriefData, type BriefSection } from "./types";

/** DB column for each section (brand_briefs). Text sections are stored as {"text": "..."}; list sections as arrays. */
export const SECTION_COLUMN: Record<BriefSection, string> = {
  business: "brand", voice: "voice", goals: "goals", offers: "offers", restrictions: "restrictions",
  competitors: "competitors", channels: "channels", personas: "personas", objections: "objections", pillars: "pillars",
};

const isList = (s: BriefSection): s is (typeof LIST_SECTIONS)[number] => (LIST_SECTIONS as readonly string[]).includes(s);

export function briefFromRow(row: Record<string, unknown> | null | undefined): BriefData {
  const out: BriefData = {};
  if (!row) return out;
  for (const s of TEXT_SECTIONS) {
    const v = row[SECTION_COLUMN[s]] as { text?: unknown } | undefined;
    if (v && typeof v.text === "string" && v.text.trim()) out[s] = v.text;
  }
  for (const s of LIST_SECTIONS) {
    const v = row[SECTION_COLUMN[s]];
    if (Array.isArray(v)) {
      const items = v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter(Boolean);
      if (items.length) out[s] = items;
    }
  }
  return out;
}

/** Turn a proposed value into what the column stores. List sections accept one item per line, with or without bullets. */
export function briefValueForColumn(section: BriefSection, value: string): { text: string } | string[] {
  if (!isList(section)) return { text: value.trim() };
  return value.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, 12).map((l) => l.slice(0, 300));
}
