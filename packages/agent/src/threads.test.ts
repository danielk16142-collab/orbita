import { describe, expect, it } from "vitest";
import { formatSummary, parseStoredSummary, ThreadSummary, SUMMARY_TOOL } from "./threads";
import { buildSystemPrompt } from "./prompt";

describe("thread handovers", () => {
  it("round-trips the stored summary", () => {
    const s = ThreadSummary.parse({ title: "November strategy", summary: "Built and accepted the November strategy.", open_items: ["Reel script for Thursday", 4, ""] });
    expect(s.open_items).toEqual(["Reel script for Thursday"]);
    const stored = formatSummary(s);
    expect(parseStoredSummary(stored)).toEqual({ title: "November strategy", summary: "Built and accepted the November strategy.", open: ["Reel script for Thursday"] });
    expect(parseStoredSummary("")).toBeNull();
  });

  it("is a strict tool", () => { expect(SUMMARY_TOOL.strict).toBe(true); });

  it("puts earlier handovers in the system prompt, wrapped as data", () => {
    const base = { locale: "en" as const, clientName: "Acme", clientLanguages: ["en" as const], markets: [], brief: {}, memories: [], sources: [], proofItems: [], rules: [], recentExamples: [], audit: null, briefUpdatedAt: null, today: "2026-10-14", weekStart: "2026-10-13" };
    const p = buildSystemPrompt({ ...base, recentThreads: [{ date: "2026-10-13", summary: "Accepted the strategy.\n- Reel script" }] } as never);
    expect(p).toContain("Earlier conversations");
    expect(p).toContain("Accepted the strategy.");
    expect(buildSystemPrompt(base as never)).toContain("this is the first conversation");
  });
});
