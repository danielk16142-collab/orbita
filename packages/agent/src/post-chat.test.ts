import { describe, expect, it } from "vitest";
import { IDEAS_TOOL, PostIdeas, postChatFocus, postChatTools, TOOL_DEFS } from "./index";

describe("post chat", () => {
  it("only offers the tool that drafts the chosen format", () => {
    expect(postChatTools("carousel")).toEqual(["get_brief", "get_account_analytics", "propose_carousel"]);
    expect(postChatTools("video")).toContain("propose_reel");
    expect(postChatTools("article")).toEqual(["get_brief", "get_account_analytics"]); // written in the reply
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
