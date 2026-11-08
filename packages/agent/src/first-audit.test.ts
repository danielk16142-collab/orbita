import { describe, expect, it } from "vitest";
import { pickBrandColors, normalizeColor } from "./brand-colors";
import { FirstAudit, firstAuditBriefOps, firstAuditRequest, pagesToRead } from "./first-audit";
import { analyzeHtml } from "./site";

describe("brand colours from a website", () => {
  it("finds the colours the site repeats, not greys", () => {
    const css = ".a{color:#ff4e1b} .b{background:#FF4E1B} .c{color:#fff} .d{color:#333} .e{border-color:rgb(10, 125, 90)} .f{color:#ff4e1c}";
    expect(pickBrandColors(css)).toEqual(["#ff4e1b", "#0a7d5a"]);
    expect(normalizeColor("#abc")).toBe("#aabbcc");
    expect(normalizeColor("rgba(0,0,0,0.1)")).toBeNull();
  });
  it("reads them from the page", () => {
    const s = analyzeHtml('<html><head><meta name="theme-color" content="#0a7d5a"><style>.btn{background:#ff4e1b}</style></head><body><a style="color:#ff4e1b">Book</a></body></html>', "https://cafe.example.com/");
    expect(s.colors?.slice(0, 2)).toEqual(["#0a7d5a", "#ff4e1b"]);
  });
});

describe("first audit", () => {
  const a = FirstAudit.parse({ business: "A café in Montreal", offers: "Coffee, brunch", audience: ["Students", "Remote workers"], voice: "Warm", competitors: "", channels: "Instagram", summary: "Good site", strengths: [], weaknesses: [], opportunities: [], social_notes: "", questions: ["What is your goal this year?"] });
  it("fills only the empty sections", () => {
    const ops = firstAuditBriefOps({ business: "Already written" }, a);
    expect(ops.map((o) => o.section)).toEqual(["offers", "voice", "channels", "personas"]);
    expect(ops.find((o) => o.section === "personas")?.value).toEqual(["Students", "Remote workers"]);
    expect(ops.find((o) => o.section === "offers")?.value).toEqual({ text: "Coffee, brunch" });
  });
  it("sends the pages as data and picks the useful pages", () => {
    const home = analyzeHtml('<a href="/about-us">About</a><a href="/services">Services</a><a href="/blog/post">Blog</a><a href="/contact">Contact</a>', "https://cafe.example.com/");
    expect(pagesToRead(home)).toEqual(["https://cafe.example.com/about-us", "https://cafe.example.com/services", "https://cafe.example.com/contact"]);
    const q = firstAuditRequest({ name: "Café Luna", markets: ["Montreal"], languages: ["en", "fr"], pages: [home], socials: [{ kind: "instagram", url: null, handle: "cafeluna" }], pageErrors: [] });
    expect(q).toContain("instagram: @cafeluna");
    expect(q).toMatch(/untrusted/);
  });
});

import { buildSystemPrompt } from "./prompt";
describe("the agent after a first audit", () => {
  it("starts from the audit and asks its open questions", () => {
    const base = { locale: "en", clientName: "Café Luna", clientLanguages: ["en"], markets: [], brief: { business: "A café" }, memories: [], sources: [{ kind: "website", url: "https://cafe.example.com", handle: null }], proofItems: [], rules: [], recentExamples: [], briefUpdatedAt: null, today: "2026-11-08", weekStart: "2026-11-09",
      audit: { summary: "Good site, no booking", strengths: [], weaknesses: [], opportunities: [], social_notes: "", missing_info: ["What is your goal this year?"] } } as unknown as Parameters<typeof buildSystemPrompt>[0];
    const p = buildSystemPrompt(base);
    expect(p).toContain("A first audit was already done");
    expect(p).toContain("Open questions for the owner: What is your goal this year?");
    expect(buildSystemPrompt({ ...base, audit: null })).not.toContain("A first audit was already done");
  });
});
