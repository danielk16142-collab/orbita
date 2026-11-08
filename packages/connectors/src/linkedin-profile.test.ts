import { describe, expect, it } from "vitest";
import { activityFrom, fetchLinkedInProfile, isCustomLinkedInId, linkedinIdFromLink, mapLinkedInProfile } from "./linkedin-profile";
import { ApifyError } from "./apify";

const SAMPLE = {
  publicIdentifier: "dany-camacho", firstName: "Dany", lastName: "Camacho", followerCount: 812,
  headline: "I build websites that sell for service businesses", about: "Para 1.\r\n\r\n\r\nPara 2\u0000 book a call: calendly.com/dany",
  photo: "https://media.licdn.com/x.jpg", topSkills: "Web Design • SEO • Branding",
  experience: [
    { position: "Founder", companyName: "Dany Designs", startDate: { text: "Jan 2020" }, endDate: { text: "Present" }, description: "Websites for clinics." },
    { position: "Designer", companyName: "Studio X", startDate: { text: "2017" }, endDate: { text: "2019" }, description: "Brand work." },
  ],
  receivedRecommendations: [{ text: "Sales went up 115% after the new site." }],
  featured: [{ title: "Recovery House case study", link: "https://danydesigns.com/work" }],
};

describe("linkedin profile read", () => {
  it("only accepts personal profile links", () => {
    expect(linkedinIdFromLink("https://www.linkedin.com/in/dany-camacho/")).toBe("dany-camacho");
    expect(linkedinIdFromLink("linkedin.com/in/dany-camacho?utm=x")).toBe("dany-camacho");
    expect(linkedinIdFromLink("https://ca.linkedin.com/in/jane")).toBe("jane");
    expect(linkedinIdFromLink("https://www.linkedin.com/company/dany-designs")).toBeNull();
    expect(linkedinIdFromLink("https://evil.com/in/x")).toBeNull();
    expect(linkedinIdFromLink("https://notlinkedin.com/in/x")).toBeNull();
  });
  it("tells a custom profile id from LinkedIn's default one", () => {
    expect(isCustomLinkedInId("dany-camacho")).toBe(true);
    expect(isCustomLinkedInId("danycamacho")).toBe(true);
    expect(isCustomLinkedInId("dany-camacho-4a7b9c12")).toBe(false);
    expect(isCustomLinkedInId("parastou-divdad-130741194")).toBe(false);
  });
  it("maps a profile to the score fields", () => {
    const r = mapLinkedInProfile(SAMPLE)!;
    expect(r.name).toBe("Dany Camacho");
    expect(r.followers).toBe(812);
    expect(r.fields.headline).toBe(SAMPLE.headline);
    expect(r.fields.about).toBe("Para 1.\n\nPara 2 book a call: calendly.com/dany");
    expect(r.fields.currentRole).toBe("Founder at Dany Designs (Jan 2020 to Present)\nWebsites for clinics.");
    expect(r.fields.pastRoles).toContain("Designer at Studio X (2017 to 2019)");
    expect(r.fields.topSkills).toBe("Web Design, SEO, Branding");
    expect(r.fields.featured).toContain("Recovery House case study");
    expect(r.fields).toMatchObject({ photo: "recent_face", recommendations: 1, recommendationsNameOutcomes: true, customUrl: true, contactLink: true });
    expect(r.guessed).toContain("photo");
  });
  it("drops error items and empty ones", () => {
    expect(mapLinkedInProfile({ error: "Profile not found" })).toBeNull();
    expect(mapLinkedInProfile({})).toBeNull();
    expect(mapLinkedInProfile("x")).toBeNull();
  });
  it("turns the newest post date into the activity answer", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    expect(activityFrom(["2026-11-05T10:00:00Z", "2026-09-01T00:00:00Z"], now)).toBe("7d");
    expect(activityFrom(["2026-10-20T10:00:00Z"], now)).toBe("30d");
    expect(activityFrom(["2026-01-01T10:00:00Z"], now)).toBe("older");
    expect(activityFrom([], now)).toBe("never");
  });
  it("reads profile and posts together, and keeps going when only the posts read fails", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      if (url.includes("linkedin-profile-posts")) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify([SAMPLE]), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchLinkedInProfile("dany-camacho", { token: "t", fetchImpl: f });
    expect(calls).toHaveLength(2);
    expect(r.fields.activity).toBeUndefined();
    const ok = (async (url: string) => new Response(JSON.stringify(url.includes("posts") ? [{ postedAt: { date: new Date().toISOString() } }] : [SAMPLE]))) as unknown as typeof fetch;
    expect((await fetchLinkedInProfile("dany-camacho", { token: "t", fetchImpl: ok })).fields.activity).toBe("7d");
  });
  it("fails clearly when the profile cannot be read", async () => {
    const credit = (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch;
    await expect(fetchLinkedInProfile("dany-camacho", { token: "t", fetchImpl: credit })).rejects.toMatchObject({ code: "no_credit" });
    const empty = (async () => new Response("[]")) as unknown as typeof fetch;
    await expect(fetchLinkedInProfile("dany-camacho", { token: "t", fetchImpl: empty })).rejects.toBeInstanceOf(ApifyError);
    await expect(fetchLinkedInProfile("bad id!", { token: "t" })).rejects.toBeInstanceOf(ApifyError);
  });
});
