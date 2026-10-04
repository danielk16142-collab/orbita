import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, allowedStatusChanges, buildScript, groupByDate, isTimeZone, monthGrid, navigate, parseContent, PostEdit, rangeFor, readingSeconds,
  safeCell, startOfWeek, toCsv, validDate, zonedToUtc, type ExportRow,
} from "./index";

describe("calendar", () => {
  it("validates real dates only", () => { expect(validDate("2026-10-04")).toBe(true); for (const b of ["2026-02-30", "2026-13-01", "10/04/2026", "", null, "2026-1-4"]) expect(validDate(b as string)).toBe(false); });
  it("adds days and months, clamping to month end", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01"); expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"); expect(addMonths("2026-12-15", 1)).toBe("2027-01-15"); expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("finds the start of the week (Monday first, or Sunday)", () => {
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sunday -> previous Monday
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05"); expect(startOfWeek("2026-10-08")).toBe("2026-10-05"); expect(startOfWeek("2026-10-04", 0)).toBe("2026-10-04");
  });
  it("builds a month grid of full weeks that contains every day of the month", () => {
    const g = monthGrid("2026-10-15");
    expect(g.weeks.every((w) => w.length === 7)).toBe(true); expect(g.weeks[0][0]).toBe("2026-09-28"); expect(g.weeks.at(-1)![6]).toBe("2026-11-01");
    const flat = g.weeks.flat(); for (let d = 1; d <= 31; d++) expect(flat).toContain(`2026-10-${String(d).padStart(2, "0")}`);
    expect(g.weeks).toHaveLength(5); expect(monthGrid("2027-02-10").weeks).toHaveLength(4); expect(monthGrid("2026-02-10").weeks).toHaveLength(5); // Feb 2026 starts on a Sunday
  });
  it("gives the visible range and navigates by view", () => {
    expect(rangeFor("day", "2026-10-04")).toEqual({ from: "2026-10-04", to: "2026-10-04" }); expect(rangeFor("week", "2026-10-04")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(rangeFor("month", "2026-10-15")).toEqual({ from: "2026-09-28", to: "2026-11-01" });
    expect(navigate("day", "2026-10-04", 1)).toBe("2026-10-05"); expect(navigate("week", "2026-10-04", -1)).toBe("2026-09-27"); expect(navigate("month", "2026-10-31", 1)).toBe("2026-11-30");
  });
  it("groups by date, ordering by time with untimed posts last", () => {
    const m = groupByDate([{ planned_date: "2026-10-05", suggested_time: null, n: 3 }, { planned_date: "2026-10-05", suggested_time: "18:00", n: 2 }, { planned_date: "2026-10-05", suggested_time: "09:00", n: 1 }, { planned_date: null, suggested_time: null, n: 9 }]);
    expect(m.get("2026-10-05")!.map((p) => p.n)).toEqual([1, 2, 3]); expect(m.size).toBe(1);
  });
  it("converts a client-local date and time to the right UTC instant, including daylight saving", () => {
    expect(zonedToUtc("2026-07-15", "09:00", "America/Toronto").toISOString()).toBe("2026-07-15T13:00:00.000Z"); // EDT
    expect(zonedToUtc("2026-01-15", "09:00", "America/Toronto").toISOString()).toBe("2026-01-15T14:00:00.000Z"); // EST
    expect(zonedToUtc("2026-10-05", "20:30", "Asia/Tokyo").toISOString()).toBe("2026-10-05T11:30:00.000Z");
    expect(zonedToUtc("2026-10-05", "12:00", "UTC").toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(zonedToUtc("2026-10-05", "12:00", "Not/AZone").toISOString()).toBe("2026-10-05T12:00:00.000Z"); // unknown zone: falls back to UTC
  });
  it("recognises real timezones", () => { expect(isTimeZone("America/Bogota")).toBe(true); for (const b of ["", "Mars/Olympus", "x".repeat(70)]) expect(isTimeZone(b)).toBe(false); });
});

describe("status rules", () => {
  it("clients approve drafts or send approved posts back, and nothing else", () => {
    expect(allowedStatusChanges("client", "draft")).toEqual(["approved"]); expect(allowedStatusChanges("client", "approved")).toEqual(["draft"]);
    for (const s of ["idea", "scheduled", "published", "failed", "publishing"] as const) expect(allowedStatusChanges("client", s)).toEqual([]);
  });
  it("staff move posts through the workflow but never set publishing/failed", () => {
    const a = allowedStatusChanges("admin", "draft"); expect(a).toEqual(expect.arrayContaining(["idea", "approved", "scheduled", "published"]));
    expect(a).not.toContain("publishing"); expect(a).not.toContain("failed"); expect(a).not.toContain("draft"); expect(allowedStatusChanges("team", "approved")).toContain("scheduled");
  });
});

describe("csv export", () => {
  const row = (over: Partial<ExportRow> = {}): ExportRow => ({ date: "2026-10-05", time: "18:30", client: "Acme", network: "instagram", format: "reel", status: "draft", language: "en", pillar: "education", idea: "How we bake", caption: "Hello, world", hashtags: ["pan", "bakery"], ...over });
  it("quotes commas, quotes and newlines, joins hashtags, and starts with a BOM and a header", () => {
    const out = toCsv([row({ caption: 'He said "hi"\nsecond line' })]);
    expect(out.startsWith("﻿Date,Time,Client,Network,Format,Status,Language,Pillar,Idea,Caption,Hashtags\r\n")).toBe(true);
    expect(out).toContain('"He said ""hi""\nsecond line"'); expect(out).toContain("#pan #bakery"); expect(out.endsWith("\r\n")).toBe(true);
  });
  it("neutralizes spreadsheet formulas (CSV injection)", () => {
    for (const evil of ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd"]) expect(safeCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(safeCell("normal text")).toBe("normal text"); expect(safeCell(null)).toBe(""); expect(safeCell(["a"])).toBe("#a");
  });
});

describe("teleprompter script", () => {
  const reel = { duration_seconds: 30, hook_options: ["Hook A", "Hook B", "Hook C"], audio_note: "", cta: "Save this", scenes: [
    { seconds: "0-3s", visual: "dough", voiceover: "Nobody tells you this.", on_screen_text: "Mistake #1" },
    { seconds: "3-10s", visual: "oven", voiceover: "   ", on_screen_text: "" },
    { seconds: "10-25s", visual: "bread", voiceover: "Proof it twice for a better crumb.", on_screen_text: "" }] };
  it("reads the chosen hook, then each spoken scene, then the call to action", () => {
    const l = buildScript(reel, 1);
    expect(l.map((x) => x.kind)).toEqual(["hook", "scene", "scene", "cta"]); expect(l[0].text).toBe("Hook B"); expect(l[1].cue).toBe("0-3s · on screen: Mistake #1"); expect(l.at(-1)!.text).toBe("Save this");
  });
  it("clamps an out-of-range hook choice and estimates reading time", () => {
    expect(buildScript(reel, 99)[0].text).toBe("Hook C"); expect(buildScript(reel, -4)[0].text).toBe("Hook A");
    expect(readingSeconds(buildScript(reel), 150)).toBeGreaterThan(0); expect(readingSeconds([{ kind: "scene", cue: "", text: Array(150).fill("w").join(" ") }], 150)).toBe(60);
  });
});

describe("post edits and content validation", () => {
  const base = { network: "instagram", language: "en", type: "reel", pillar: "", persona: "", funnel_stage: "", idea: "i", caption: "c", hashtags: ["a"], planned_date: "2026-10-05", suggested_time: "18:30" };
  it("accepts a valid edit and rejects bad values", () => {
    expect(PostEdit.safeParse(base).success).toBe(true);
    for (const bad of [{ network: "myspace" }, { suggested_time: "6pm" }, { planned_date: "tomorrow" }, { caption: "x".repeat(2300) }, { hashtags: Array(40).fill("h") }]) expect(PostEdit.safeParse({ ...base, ...bad }).success).toBe(false);
    expect(PostEdit.safeParse({ ...base, planned_date: null }).success).toBe(true);
  });
  it("validates content for the post's format only", () => {
    expect(parseContent("reel", reelOK()).ok).toBe(true); expect(parseContent("reel", { slides: [] }).ok).toBe(false); expect(parseContent("carousel", reelOK()).ok).toBe(false);
    expect(parseContent("static", { headline: "h", visual_brief: "v", cta: "c" }).ok).toBe(true); expect(parseContent("text", { anything: 1 }).ok).toBe(false); expect(parseContent("text", null).ok).toBe(true);
  });
});
function reelOK() { return { duration_seconds: 20, hook_options: ["h"], scenes: [{ seconds: "0-3s", visual: "v", voiceover: "x", on_screen_text: "" }], cta: "c", audio_note: "" }; }
