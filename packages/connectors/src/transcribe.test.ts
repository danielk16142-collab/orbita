import { describe, expect, it, vi } from "vitest";
import { postLink, safeVideoUrl, speechToText, transcribePost, TranscribeError, transcriptOf, transcriptRow, videoUrlOf } from "./transcribe";

describe("transcribing a public video", () => {
  it("accepts single post links only, and cleans them", () => {
    expect(postLink("https://www.instagram.com/reel/DAbc123xyz/?igsh=abc")).toEqual({ network: "instagram", url: "https://www.instagram.com/reel/DAbc123xyz/" });
    expect(postLink("https://instagram.com/reels/DAbc123xyz")).toEqual({ network: "instagram", url: "https://www.instagram.com/reel/DAbc123xyz/" });
    expect(postLink("https://www.tiktok.com/@cafe.luna/video/7300000000000000000?lang=en")).toEqual({ network: "tiktok", url: "https://www.tiktok.com/@cafe.luna/video/7300000000000000000" });
    for (const bad of ["http://www.instagram.com/reel/DAbc123xyz/", "https://www.instagram.com/cafeluna/", "https://evil.com/reel/DAbc123xyz/", "https://user:pw@instagram.com/reel/DAbc123xyz/", "nope"]) expect(postLink(bad)).toBeNull();
  });
  it("downloads only from the networks' CDNs or Apify", () => {
    expect(safeVideoUrl("https://scontent-mia3-1.cdninstagram.com/v/t50/x.mp4?sig=1")).toBeTruthy();
    expect(safeVideoUrl("https://v16-webapp.tiktokcdn-us.com/x.mp4")).toBeTruthy();
    expect(safeVideoUrl("https://169.254.169.254/latest")).toBeNull();
    expect(safeVideoUrl("http://scontent.cdninstagram.com/x.mp4")).toBeNull();
    expect(videoUrlOf("instagram", { videoUrl: "https://scontent.cdninstagram.com/a.mp4" })).toContain("cdninstagram");
    expect(videoUrlOf("tiktok", { mediaUrls: ["https://api.apify.com/v2/key-value-stores/x/records/v.mp4"] })).toContain("api.apify.com");
  });
  it("uses the transcript actor for an Instagram reel, only when it is the same reel and delivered", async () => {
    vi.stubEnv("APIFY_TOKEN", "tok"); vi.stubEnv("OPENAI_API_KEY", "");
    const seen: { url: string; body: unknown }[] = [];
    const ok = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(u), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify([{ status: "transcribed", charged: true, shortCode: "DAbc123xyz", transcript: " Hola,  esto es una prueba " }, { _summary: true }]));
    });
    expect(await transcribePost("https://www.instagram.com/reel/DAbc123xyz/?igsh=1", { fetchImpl: ok as unknown as typeof fetch })).toBe("Hola, esto es una prueba");
    expect(seen[0].url).toContain("/acts/steadyfetch~instagram-reel-transcript-scraper/run-sync-get-dataset-items");
    expect(seen[0].url).toContain("maxTotalChargeUsd=");
    expect(seen[0].url).not.toContain("tok");
    expect(seen[0].body).toMatchObject({ reelUrls: ["https://www.instagram.com/reel/DAbc123xyz/"], maxItems: 1 });
    const other = vi.fn(async () => new Response(JSON.stringify([{ status: "transcribed", shortCode: "ZZZother99", transcript: "wrong reel" }])));
    await expect(transcribePost("https://www.instagram.com/reel/DAbc123xyz/", { fetchImpl: other as unknown as typeof fetch })).rejects.toMatchObject({ code: "no_transcript" });
    const priv = vi.fn(async () => new Response(JSON.stringify([{ status: "private", charged: false, statusReason: "Private account", shortCode: "DAbc123xyz", transcript: null }])));
    await expect(transcribePost("https://www.instagram.com/reel/DAbc123xyz/", { fetchImpl: priv as unknown as typeof fetch })).rejects.toMatchObject({ code: "no_transcript" });
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: { type: "run-failed", message: "Actor run did not succeed" } }), { status: 400 }));
    await expect(transcribePost("https://www.instagram.com/reel/DAbc123xyz/", { fetchImpl: refused as unknown as typeof fetch })).rejects.toMatchObject({ code: "provider_error", detail: "run-failed: Actor run did not succeed" });
    expect(transcriptRow({ status: "onscreen_text_extracted", transcript: null, onScreenText: "3 tips" }, "x").text).toBe("3 tips");
    expect(transcriptOf({ transcript: [{ text: "Uno" }, { text: "dos" }] })).toBe("Uno dos");
    vi.unstubAllEnvs();
  });
  it("runs the chain: Apify lookup with the token in a header, download, speech to text", async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url); calls.push(u);
      if (u.includes("instagram-reel-transcript-scraper")) return new Response(JSON.stringify([{ status: "music_only", charged: false, shortCode: "DAbc123xyz", transcript: null }])); // none: fall back
      if (u.includes("api.apify.com/v2/acts")) {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
        expect(JSON.parse(String(init?.body)).directUrls).toEqual(["https://www.instagram.com/reel/DAbc123xyz/"]);
        return new Response(JSON.stringify([{ videoUrl: "https://scontent.cdninstagram.com/a.mp4" }]));
      }
      if (u.includes("cdninstagram")) return new Response(new Uint8Array([1, 2, 3]));
      expect(u).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk");
      return new Response(JSON.stringify({ text: "  Comenta SKILL\u0007 y te mando el link  " }));
    });
    vi.stubEnv("APIFY_TOKEN", "tok"); vi.stubEnv("OPENAI_API_KEY", "sk");
    expect(await transcribePost("https://www.instagram.com/reel/DAbc123xyz/", { fetchImpl: f as unknown as typeof fetch })).toBe("Comenta SKILL y te mando el link");
    expect(calls.every((u) => !u.includes("tok"))).toBe(true);
    vi.unstubAllEnvs();
  });
  it("reports clear errors", async () => {
    await expect(transcribePost("https://example.com/x")).rejects.toMatchObject({ code: "bad_link" });
    await expect(speechToText(new Uint8Array([1]), { apiKey: "", fetchImpl: fetch })).rejects.toBeInstanceOf(TranscribeError);
    const empty = vi.fn(async () => new Response(JSON.stringify({ text: "   " })));
    await expect(speechToText(new Uint8Array([1]), { apiKey: "sk", fetchImpl: empty as unknown as typeof fetch })).rejects.toMatchObject({ code: "no_speech" });
  });
});
