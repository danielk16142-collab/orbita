import { BRIEF_SECTIONS, LIST_SECTIONS, type BriefData, type BriefSection } from "./types";

const WEIGHT: Record<BriefSection, number> = {
  business: 15, goals: 15, personas: 15, offers: 10, voice: 10, pillars: 10,
  objections: 5, competitors: 5, channels: 5, restrictions: 5,
};
const SOURCES_WEIGHT = 5;
/** Below this the agent runs the interview; above it, it works as an everyday marketing partner. */
export const ONBOARDING_THRESHOLD = 60;

export function computeCompleteness(brief: BriefData, opts: { hasSources: boolean }): { score: number; missing: BriefSection[] } {
  let score = opts.hasSources ? SOURCES_WEIGHT : 0;
  const missing: BriefSection[] = [];
  for (const s of BRIEF_SECTIONS) {
    const v = brief[s];
    const filled = (LIST_SECTIONS as readonly string[]).includes(s) ? Array.isArray(v) && v.length > 0 : typeof v === "string" && v.trim().length >= 20;
    if (filled) score += WEIGHT[s]; else missing.push(s);
  }
  // Most valuable gaps first.
  missing.sort((a, b) => WEIGHT[b] - WEIGHT[a]);
  return { score: Math.min(100, score), missing };
}
