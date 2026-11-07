import { describe, expect, it } from "vitest";
import { IDEAS_TOOL, PostIdeas, postChatFocus, postChatTools, TOOL_DEFS } from "./index";

describe("post chat", () => {
  it("only offers the tool that drafts the chosen format", () => {
    expect(postChatTools("carousel")).toEqual(["get_brief", "get_account_analytics", "propose_carousel"]);
    expect(postChatTools("video")).toContain("propose_reel");
    expect(postChatTools("article")).toEqual(["get_brief", "get_account_analytics", "linkedin_hook_formulas", "lint_linkedin_post"]); // written in the reply, with the LinkedIn tools
    for (const f of ["reel", "carousel", "static", "story", "video", "text", "article"] as const)
      for (const name of postChatTools(f)) expect(TOOL_DEFS.some((t) => t.name === name)).toBe(true);
  });
  it("keeps the conversation on one post and names the drafting tool", () => {
    const s = postChatFocus({ format: "static", networks: ["instagram", "facebook"], idea: 'Brunch "special"' });
    expect(s).toContain("ONE piece of content");
    expect(s).toContain("propose_static_post, once per network");
    expect(s).toContain("instagram, facebook");
    expect(s).not.toContain('"special"'); // the person's quotes cannot close ours
  });
  it("cleans the ideas: drops malformed ones, caps the list, defaults the source", () => {
    const r = PostIdeas.parse({ ideas: [{ title: "A", hook: "h", why: "w", source: "plan" }, { title: "" }, ...Array(8).fill({ title: "B", hook: "", why: "", source: "nope" })] });
    expect(r.ideas).toHaveLength(6);
    expect(r.ideas[1].source).toBe("brand");
    expect(IDEAS_TOOL.strict).toBe(true);
  });
});

import { buildSystemPrompt, contentAsText } from "./index";
describe("working on one post", () => {
  const existing = { day: "2026-11-09", time: "18:00", pillar: null, why: null, hasContent: true, idea: "Smash burger reveal", draft: contentAsText("reel", { duration_seconds: 20, hook_options: ["The crust is the whole point"], scenes: [{ seconds: "0-3s", visual: "Patty hits the grill", voiceover: "Listen to that.", on_screen_text: "Smash" }], cta: "Come try it", audio_note: "" }), caption: "Our smash burger is here.", hashtags: ["burger"], videoScript: null };
  it("gives the agent the post itself and tells it to change only what is asked, never to pull from the strategy", () => {
    const f = postChatFocus({ format: "reel", networks: ["tiktok"], idea: "Smash burger reveal", existing });
    expect(f).toContain("the source of truth");
    expect(f).toContain("Listen to that.");
    expect(f).toContain("Our smash burger is here.");
    expect(f).toContain("#burger");
    expect(f).toContain("Change only what the person asks");
    expect(f).toContain("Never bring in topics, angles or examples from the strategy");
    expect(f).not.toContain("Base the angle on the active strategy");
  });
  it("keeps a new post on the person's idea", () => {
    expect(postChatFocus({ format: "reel", networks: ["tiktok"], idea: "Burger" })).toContain("Stay on the person's idea");
  });
  it("leaves the strategy, plan and research out of the prompt in post scope", () => {
    const base = { locale: "en", clientName: "B", clientLanguages: ["en"], markets: [], brief: {}, memories: [], sources: [], proofItems: [], rules: [], recentExamples: [], audit: null, briefUpdatedAt: null, today: "2026-11-08", weekStart: "2026-11-09",
      strategy: { title: "Q4 lead gen", period: "quarter", createdAt: "2026-10-01T00:00:00Z", content: { topics: ["AI automation for leads"] } }, lastPlan: "Monday: AI audit post", research: [] } as unknown as Parameters<typeof buildSystemPrompt>[0];
    expect(buildSystemPrompt(base)).toContain("AI automation for leads");
    const scoped = buildSystemPrompt({ ...base, scope: "post" });
    expect(scoped).not.toContain("AI automation for leads");
    expect(scoped).not.toContain("Monday: AI audit post");
  });
});
