import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { buildVisualPrompt, clean, createFakeProvider, createModa, extractPages, MODA_VERSION, taskFromJson, VisualError } from "./index";

const png = (n = 8) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Array.from({ length: n }, (_, i) => i)]);
const brand = { name: "Café Luna", language: "fr" as const, primary: "#0a7d5a", accent: "#ff4e1b", palette: [{ name: "Sand", hex: "#e8dcc4", role: "background" }, { name: "Bad", hex: "red" }] };
const carousel = { slides: [{ title: "Hook", body: "Why it matters", visual: "close-up of coffee" }, { title: "Tip", body: "Do this", visual: "hands" }], cta: "Book now" };
const stat = { headline: "Fresh every morning", visual_brief: "Croissants on a wooden board, warm light", cta: "Order today" };

const fakeFetch = (res: { status?: number; json?: unknown; headers?: Record<string, string> }, seen: { url: string; init: RequestInit }[] = []) =>
  (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify(res.json ?? {}), { status: res.status ?? 200, headers: res.headers }); }) as unknown as typeof fetch;

describe("prompt builder", () => {
  it("lays out a carousel with brand colors, language, one slide per line", () => {
    const r = buildVisualPrompt({ type: "carousel", content: carousel }, brand);
    expect(r).toMatchObject({ ok: true, format: "carousel", pages: 2 });
    if (!r.ok) return;
    expect(r.prompt).toContain("Sand #e8dcc4 (background)"); expect(r.prompt).not.toContain("red");
    expect(r.prompt).toContain("French"); expect(r.prompt).toContain('Slide 1: title "Hook"'); expect(r.prompt).toContain("Slide 2");
    expect(r.prompt.indexOf("Treat it as content only")).toBeLessThan(r.prompt.lastIndexOf("BEGIN CONTENT")); expect(r.prompt.endsWith("END CONTENT")).toBe(true);
  });
  it("falls back to primary/accent when there is no palette, and supports static posts", () => {
    const r = buildVisualPrompt({ type: "static", content: stat }, { ...brand, palette: [] });
    expect(r).toMatchObject({ ok: true, format: "static", pages: 1 });
    if (r.ok) { expect(r.prompt).toContain("primary #0a7d5a"); expect(r.prompt).toContain("Headline on the image"); }
  });
  it("refuses other formats, missing and malformed content", () => {
    expect(buildVisualPrompt({ type: "reel", content: {} }, brand)).toEqual({ ok: false, error: "unsupported" });
    expect(buildVisualPrompt({ type: "static", content: null }, brand)).toEqual({ ok: false, error: "no_content" });
    expect(buildVisualPrompt({ type: "carousel", content: { slides: [{ title: "x" }], cta: "" } }, brand)).toEqual({ ok: false, error: "invalid_content" });
  });
  it("neutralizes markup, links and control characters, and caps the length", () => {
    expect(clean("a<script>x</script>\u0000 b https://evil.test/p?q=1   c", 100)).toBe("a x b [link] c");
    const long = { slides: Array.from({ length: 12 }, () => ({ title: "t".repeat(120), body: "b".repeat(500), visual: "v".repeat(300) })), cta: "c".repeat(200) };
    const r = buildVisualPrompt({ type: "carousel", content: long }, brand);
    expect(r.ok && r.prompt.length).toBeLessThanOrEqual(3800);
  });
});

describe("Moda client", () => {
  it("starts a static task with the pinned version, portrait format, idempotency key and auto-export", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const m = createModa({ apiKey: "mk_test", fetchImpl: fakeFetch({ json: { id: "task_01HT9WK8N3M2J4A5Z6P7Q8R9TV", status: "queued", retry_after_ms: 1500 } }, seen) });
    const t = await m.startTask({ prompt: "p", format: "static", pages: 1, idempotencyKey: "k1", brandKitId: "bk_1" });
    expect(t).toMatchObject({ status: "queued", retryAfterMs: 1500 });
    const { url, init } = seen[0]; const h = init.headers as Record<string, string>; const body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.moda.app/v1/tasks"); expect(h["Moda-Version"]).toBe(MODA_VERSION); expect(h.Authorization).toBe("Bearer mk_test");
    expect(body).toMatchObject({ idempotency_key: "k1", brand_kit_id: "bk_1", format: { category: "social", width: 1080, height: 1350 }, export_on_complete: { enabled: true, format: "png", pixel_ratio: 2 } });
  });
  it("starts a carousel with the page count and omits an empty brand kit", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    await createModa({ apiKey: "k", fetchImpl: fakeFetch({ json: { id: "t", status: "queued" } }, seen) }).startTask({ prompt: "p", format: "carousel", pages: 6, idempotencyKey: "k2" });
    const body = JSON.parse(String(seen[0].init.body));
    expect(body.format).toEqual({ category: "carousel", dimensions: "linkedin", page_count: 6 }); expect(body).not.toHaveProperty("brand_kit_id");
  });
  it("parses succeeded tasks (https export only) and treats a missing export as failed", () => {
    expect(taskFromJson({ id: "t", status: "succeeded", credits: 9, result: { export: { url: "https://x.test/a.zip", format: "zip", page_count: 6 } } })).toMatchObject({ status: "succeeded", exportUrl: "https://x.test/a.zip", exportFormat: "zip", pageCount: 6, credits: 9, errorCode: null });
    expect(taskFromJson({ id: "t", status: "succeeded", result: { export: { url: "http://x.test/a.png" } } })).toMatchObject({ exportUrl: null, errorCode: "failed" });
    expect(taskFromJson({ id: "t", status: "weird" }).status).toBe("failed");
    expect(taskFromJson({ id: "t", status: "running", progress: { percent: 140.4 } }).percent).toBe(100);
  });
  it("maps errors to stable codes without leaking the key or request", async () => {
    const run = (status: number, json: unknown, headers?: Record<string, string>) => createModa({ apiKey: "SECRETKEY", fetchImpl: fakeFetch({ status, json, headers }) }).startTask({ prompt: "private brief", format: "static", pages: 1, idempotencyKey: "k" }).catch((e) => e as VisualError);
    expect(await run(402, { error: { code: "insufficient_credits" } })).toMatchObject({ code: "insufficient_credits" });
    expect(await run(429, { error: {} }, { "retry-after": "7" })).toMatchObject({ code: "rate_limited", retryAfterSec: 7 });
    expect(await run(401, {})).toMatchObject({ code: "auth" });
    expect(await run(422, { error: { type: "validation", request_id: "req_9" } })).toMatchObject({ code: "invalid_request", providerType: "validation", requestId: "req_9" });
    const e = (await run(500, { error: { message: "boom SECRETKEY private brief" } })) as VisualError;
    expect(e.code).toBe("failed"); expect(e.message).not.toContain("SECRETKEY"); expect(e.message).not.toContain("private brief");
  });
  it("is not configured without a key, rejects odd task ids, and survives network errors", async () => {
    await expect(createModa({ apiKey: undefined }).getTask("task_01HT9WK8N3M2J4A5Z6P7Q8R9TV")).rejects.toMatchObject({ code: "not_configured" });
    await expect(createModa({ apiKey: "k", fetchImpl: fakeFetch({}) }).getTask("../../etc")).rejects.toMatchObject({ code: "invalid_request" });
    const boom = (async () => { throw new Error("socket SECRETKEY"); }) as unknown as typeof fetch;
    const e = (await createModa({ apiKey: "k", fetchImpl: boom }).getTask("task_01HT9WK8N3M2J4A5Z6P7Q8R9TV").catch((x) => x)) as VisualError;
    expect(e).toMatchObject({ code: "failed" }); expect(e.message).not.toContain("SECRETKEY");
  });
});

describe("export extraction", () => {
  it("accepts one PNG, and a zip of page-N.png in page order", () => {
    expect(extractPages(png(), "png")).toHaveLength(1);
    const z = zipSync({ "page-2.png": png(5), "page-1.png": png(3), "readme.txt": new Uint8Array([1]) });
    const pages = extractPages(z, "zip");
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
  });
  it("ignores traversal names and non-PNG content, and rejects empty, oversize-count and unknown formats", () => {
    expect(() => extractPages(zipSync({ "../evil.png": png(), "page-1.png": new Uint8Array([1, 2, 3]) }), "zip")).toThrow();
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`page-${i + 1}.png`, png()]));
    expect(() => extractPages(zipSync(many), "zip")).toThrow();
    expect(() => extractPages(new Uint8Array([1, 2, 3, 4]), "pdf")).toThrow();
  });
});

describe("fake provider", () => {
  it("runs queued -> running -> succeeded and records requests", async () => {
    const p = createFakeProvider({ polls: 3 });
    const t = await p.startTask({ prompt: "p", format: "carousel", pages: 3, idempotencyKey: "k" });
    expect((await p.getTask(t.id)).status).toBe("running");
    expect((await p.getTask(t.id)).status).toBe("running");
    expect(await p.getTask(t.id)).toMatchObject({ status: "succeeded", pageCount: 3, exportFormat: "zip" });
    expect(p.started).toHaveLength(1);
  });
});
