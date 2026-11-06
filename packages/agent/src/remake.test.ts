import { describe, expect, it } from "vitest";
import { OurVersion, remakeRequest, remakeSystem } from "./remake";

const their = { hook: "3 mistakes killing your café's sales", caption: "Number 2 surprised us.", transcript: "Mistake one: no online menu.", network: "instagram", competitor: "Rival Café", formula: "Numbered Mistakes" };
describe("make our version of a competitor post", () => {
  it("sends their actual post and asks for the same post adapted", () => {
    const r = remakeRequest(their, { language: "es", notes: "mention brunch" });
    expect(r).toContain("the SAME post");
    expect(r).toContain("Do not swap the subject");
    expect(r).toContain("Rival Café");
    expect(r).toContain("Numbered Mistakes");
    expect(r).toContain("3 mistakes killing");
    expect(r).toContain("Number 2 surprised us.");
    expect(r).toContain("Mistake one: no online menu.");
    expect(r).toContain("Spanish");
    expect(r).toContain("mention brunch");
    expect(remakeRequest({ ...their, transcript: null }, { language: "en" })).toContain("follow the hook and the caption closely");
  });
  it("works apart from the strategy, and can keep their language", () => {
    const s = remakeSystem({ clientName: "Dany Designs", business: "Web studio", voice: "Warm", rules: ["No slang"], facts: ["Sites from $975"] });
    expect(s).toContain("ignore them entirely");
    expect(s).toContain("NOT to change the subject");
    expect(s).toContain("- No slang");
    expect(s).not.toMatch(/pillar \(|weekly plan/i);
    expect(remakeRequest(their, { language: "same" })).toContain("same language as their post");
  });
  it("keeps a valid reel, caption and clean hashtags", () => {
    const v = OurVersion.parse({ title: " Our 3 mistakes ", kept: "k", changed: "c", caption: "Cap", hashtags: ["#cafe", "cafe", "small biz"],
      reel: { duration_seconds: 500, hook_options: ["H1", "", "H2"], scenes: [{ seconds: "0-3s", visual: "", voiceover: "Hi", on_screen_text: "" }], cta: "Follow", audio_note: "" } });
    expect(v.title).toBe("Our 3 mistakes");
    expect(v.reel.duration_seconds).toBe(180);
    expect(v.reel.hook_options).toEqual(["H1", "H2"]);
    expect(v.reel.scenes[0].visual).toBe("-");
    expect(v.hashtags).toEqual(["cafe", "smallbiz"]);
  });
});
