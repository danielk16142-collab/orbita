import { describe, expect, it } from "vitest";
import { analyseBeats, classifyHook, cleanText, detectAi, HOOK_FORMULAS, lintCaption, rankHooks, scoreHook, totalRemoved } from "../index";

// Expected values come from running the upstream Python tools (instagram-agent-skill) on the same inputs.
describe("hook scoring (parity with hookscore.py)", () => {
  it.each([
    ["$18,000 is what one missing clause cost me.", 81.4, "STRONG"],
    ["Nobody tells you proposals can take 20 minutes", 81.4, "STRONG"],
    ["Hey guys, today I want to talk about proposals.", 9.6, "WEAK"],
    ["Stop using templates. Your clients can tell.", 81.4, "STRONG"],
    ["I quit my agency job after three months and tripled my income", 76.4, "STRONG"],
    ["Proposals used to take me five hours. Twenty minutes now.", 51.2, "OK"],
  ])("%s", (hook, score, verdict) => {
    const r = scoreHook(hook);
    expect(r.score).toBe(score);
    expect(r.verdict).toBe(verdict);
  });
  it("flags a greeting as a dealbreaker and names the weakest property", () => {
    const r = scoreHook("Hey guys, today I want to talk about proposals.");
    expect(r.flags.join(" ")).toMatch(/Greeting/);
    expect(r.weakest).toBe("FRONTLOAD");
  });
  it("ranks best first and ignores blank lines", () => {
    const ranked = rankHooks(["Hey guys, today I want to talk about proposals.", "", "$18,000 is what one missing clause cost me."]);
    expect(ranked.map((r) => r.score)).toEqual([81.4, 9.6]);
  });
  it("loads 26 formulas and classifies a cost confession", () => {
    expect(HOOK_FORMULAS).toHaveLength(26);
    expect(classifyHook("$18,000 is what one missing clause cost me.")?.name).toBe("Cost Confession");
    expect(classifyHook("zzz")).toBeNull();
  });
  it("every formula pattern compiles", () => { for (const h of HOOK_FORMULAS) expect(() => classifyHook(h.example)).not.toThrow(); });
});

describe("beat sheet (parity with beats.py)", () => {
  const script = "Proposals used to take me five hours. Twenty minutes now.\nI built one template.\nIt has three blocks: scope, price, timeline. Clients read it fast and sign the same day without asking me a single question about it.\nSteal it. Comment TEMPLATE and I will send it. Five hours, twenty minutes.";
  const a = analyseBeats(script, { target: 20 })!;
  it("times and labels beats", () => {
    expect(a.totalWords).toBe(51);
    expect(a.totalSeconds).toBeCloseTo(18.55, 1);
    expect(a.beats.map((b) => b.label)).toEqual(["HOOK", "", "", "MID", "CTA"]);
    expect(a.beats[0].dur).toBeCloseTo(3.64, 2);
  });
  it("reports the same notes", () => {
    const n = a.notes.join("\n");
    expect(n).toMatch(/hook runs|Beat 1 takes 3.6s/);
    expect(n).toMatch(/Beat\(s\) 4, 5 run past 4s/);
    expect(n).toMatch(/Beats 2-4 have nothing concrete/);
    expect(n).toMatch(/Loops: .*five, hours, minutes/);
    expect(n).toMatch(/on target \(18.5s against 20s\)/);
  });
  it("returns null for an empty script", () => expect(analyseBeats("  \n ")).toBeNull());
});

describe("caption lint (parity with caption.py)", () => {
  const cap = "$18,000 is what one missing clause cost me. Here is the fix I use now.\n\nComment CLAUSE and I will send it. Save this for later. #viral #fyp #proposals\nhttps://example.com";
  const r = lintCaption(cap);
  it("matches the upstream verdict and checks", () => {
    expect(r.verdict).toBe("REVIEW");
    expect(r.characters).toBe(170);
    const st = Object.fromEntries(r.checks.map((c) => [c.check, c.status]));
    expect(st).toMatchObject({ LENGTH: "PASS", "FIRST LINE": "PASS", "HOOK IS CONCRETE": "PASS", HASHTAGS: "WARN", "TAG PLACEMENT": "PASS", LINKS: "WARN", "ONE ASK": "WARN", EMOJI: "PASS" });
  });
  it("shows the feed window and fails an over-long or hashtag-first caption", () => {
    expect(r.visible).toHaveLength(125);
    expect(lintCaption("x".repeat(2300)).verdict).toBe("FIX");
    expect(lintCaption("#a #b #c\nhello").checks.find((c) => c.check === "FIRST LINE")?.status).toBe("FAIL");
    expect(lintCaption("Hello there. Save this.", { hashtags: ["a", "b", "c", "d", "e", "f"] }).checks.find((c) => c.check === "HASHTAGS")?.status).toBe("FAIL");
  });
});

describe("humanizer (parity with humanize.py / detect.py)", () => {
  const draft = "In today's fast-paced world, it's not just a tool — it's a game-changer. We delve into the tapestry of marketing, and leverage seamless solutions.\n\nCheck https://example.com/a—b for more.";
  it("cleans the same artefacts and leaves URLs alone", () => {
    const { text, report } = cleanText(draft);
    expect(text).toBe("Right now, it's not just a tool, it's a big deal. We look at the mix of marketing, and use clean solutions.\n\nCheck https://example.com/a—b for more.");
    expect(report.typographic[0].count).toBe(1);
    expect(report.lexical.map((h) => h.find).sort()).toEqual(["delve into", "game-changer", "in today's fast-paced world", "leverage", "seamless", "tapestry"]);
    expect(report.structures.map((s) => s.name).join()).toMatch(/not just X/);
    expect(totalRemoved(report)).toBe(7);
  });
  it("removes invisible characters and curly quotes in any language", () => {
    const { text, report } = cleanText("Hola​ mundo “hola” amigo", { lang: "es" });
    expect(text).toBe('Hola mundo "hola" amigo');
    expect(report.invisible.length).toBeGreaterThan(0);
  });
  it("applies a client's never-say terms, also outside English", () => {
    expect(cleanText("Nuestra solución líder es buena.", { lang: "es", extraTerms: ["líder"] }).text).not.toMatch(/líder/);
  });
  it("scores the slop draft as flagged, like detect.py", () => {
    const r = detectAi(draft);
    expect(r.humanScore).toBe(15);
    expect(r.verdict).toBe("FLAGGED");
    expect(r.checks["BURSTINESS"].score).toBe(50);
    expect(r.checks["VOICE"].score).toBeCloseTo(75.2, 1);
  });
  it("passes plain human text", () => {
    const human = "I messed up a launch last week. We sent 400 emails to the wrong list, and my client Marta called me at 7am. Honestly I wanted to hide. Instead I wrote back, owned it, and offered a free audit. She stayed. Lesson: tell people fast, and don't make excuses. We fixed the list in an hour and nobody left.";
    expect(detectAi(human).verdict).not.toBe("FLAGGED");
  });
});

import { cleanPost, mapContentText, reviewPost } from "../index";

describe("post review and cleaning", () => {
  const reel = {
    duration_seconds: 20,
    hook_options: ["Proposals used to take me five hours. Twenty minutes now.", "Hey guys, today I want to talk about proposals."],
    scenes: [
      { seconds: "0-3", visual: "Desk", voiceover: "I built one template — it changed everything.", on_screen_text: "5 HOURS -> 20 MIN" },
      { seconds: "3-20", visual: "Screen", voiceover: "Steal it. Comment TEMPLATE and I will send it. Five hours, twenty minutes.", on_screen_text: "" },
    ],
    cta: "Comment TEMPLATE", audio_note: "",
  };
  const post = { type: "reel", language: "en", caption: "Five hours to twenty minutes. Save this. #proposals", hashtags: ["proposals"], content: reel };
  it("reviews a reel: ranked hooks, beats, caption, AI check", () => {
    const r = reviewPost(post);
    expect(r.hooks.map((h) => h.score)).toEqual([51.2, 9.6]);
    expect(r.beats?.beats.length).toBeGreaterThan(1);
    expect(r.caption?.checks.length).toBeGreaterThan(5);
    expect(r.ai).not.toBeNull();
    expect(r.artefacts).toBe(1); // the em dash
    expect(r.englishOnly).toBe(false);
  });
  it("reviews carousel and static posts through their first line", () => {
    const car = reviewPost({ type: "carousel", language: "en", caption: null, hashtags: null, content: { slides: [{ title: "5 mistakes that cost me $4,000", body: "", visual: "" }, { title: "Two", body: "b", visual: "" }], cta: "Save this" } });
    expect(car.hooks).toHaveLength(1);
    expect(car.beats).toBeNull();
    expect(reviewPost({ type: "text", language: "en", caption: null, hashtags: null, content: null }).hooks).toEqual([]);
  });
  it("cleans every text field and keeps the content valid", () => {
    const { content, caption, removed } = cleanPost({ type: "reel", language: "en", caption: "It’s a game-changer — truly.", content: reel });
    expect(removed).toBeGreaterThanOrEqual(3);
    expect(caption).not.toMatch(/—|game-changer/);
    expect(JSON.stringify(content)).not.toMatch(/—/);
    expect(reviewPost({ ...post, caption, content }).artefacts).toBe(0);
  });
  it("leaves unknown content untouched", () => expect(mapContentText("reel", { nope: 1 }, (t) => t + "!")).toEqual({ nope: 1 }));
});
