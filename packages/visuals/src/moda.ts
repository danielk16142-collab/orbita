import { StartRequest, TaskStatus, TaskView, VisualError, type VisualProvider } from "./types";

const BASE = "https://api.moda.app/v1";
/** Pinned so response shapes cannot change under us (docs.moda.app/api-reference/versioning). */
export const MODA_VERSION = "2026-05-01";

type Json = Record<string, any>;
const STATUSES: TaskStatus[] = ["queued", "running", "succeeded", "failed", "canceled", "expired"];

/** Social posts are portrait 4:5; carousels use Moda's "linkedin" 1080x1350 carousel size, which also suits Instagram. */
function formatFor(req: StartRequest): Json {
  return req.format === "static"
    ? { category: "social", width: 1080, height: 1350, label: "Instagram portrait" }
    : { category: "carousel", dimensions: "linkedin", page_count: req.pages };
}

export function taskFromJson(j: Json): TaskView {
  const status = STATUSES.includes(j?.status) ? (j.status as TaskStatus) : "failed";
  const exp = j?.result?.export;
  const ok = status === "succeeded" && exp && typeof exp.url === "string" && exp.url.startsWith("https://");
  return {
    id: String(j?.id ?? ""), status,
    percent: typeof j?.progress?.percent === "number" ? Math.max(0, Math.min(100, Math.round(j.progress.percent))) : null,
    retryAfterMs: typeof j?.retry_after_ms === "number" ? j.retry_after_ms : null,
    credits: typeof j?.credits === "number" ? j.credits : (typeof j?.credits?.total === "number" ? j.credits.total : null),
    exportUrl: ok ? exp.url : null, exportFormat: ok ? String(exp.format ?? "png") : null, pageCount: ok && typeof exp.page_count === "number" ? exp.page_count : null,
    errorCode: status === "failed" || status === "expired" || (status === "succeeded" && !ok) ? "failed" : status === "canceled" ? "failed" : null,
  };
}

/** Maps an HTTP failure to a typed error with no request body, prompt or key in it. The provider's type and request id are kept for the server log. */
async function fail(res: Response, what: string): Promise<never> {
  let body: Json | null = null; try { body = await res.json(); } catch { /* not JSON */ }
  const e = body?.error ?? {};
  const retry = Number(res.headers.get("retry-after")) || (typeof e.retry_after_ms === "number" ? Math.ceil(e.retry_after_ms / 1000) : undefined);
  const code = res.status === 402 ? "insufficient_credits" : res.status === 429 ? "rate_limited" : res.status === 401 || res.status === 403 ? "auth" : res.status === 400 || res.status === 409 || res.status === 422 ? "invalid_request" : "failed";
  throw new VisualError(code, `${what}: ${res.status} ${String(e.code ?? e.type ?? "").slice(0, 80)}`, retry, res.status, typeof e.type === "string" ? e.type.slice(0, 80) : undefined, typeof e.request_id === "string" ? e.request_id.slice(0, 80) : undefined);
}

/** Moda REST client. `fetchImpl` is injected (tests, and the DNS-pinned fetch in the app). The key is only ever sent as a bearer header to api.moda.app. */
export function createModa(opts: { apiKey: string | undefined; fetchImpl?: typeof fetch; base?: string }): VisualProvider {
  const f = opts.fetchImpl ?? fetch;
  const base = opts.base ?? BASE;
  const headers = () => {
    if (!opts.apiKey) throw new VisualError("not_configured", "MODA_API_KEY is not set");
    return { Authorization: `Bearer ${opts.apiKey}`, "Moda-Version": MODA_VERSION, "Content-Type": "application/json" };
  };
  const call = async (path: string, init: RequestInit, what: string) => {
    let res: Response;
    try { res = await f(`${base}${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(20_000) }); }
    catch (e) { if (e instanceof VisualError) throw e; throw new VisualError("failed", `${what}: network error`); }
    if (!res.ok) await fail(res, what);
    return res.json() as Promise<Json>;
  };
  return {
    async startTask(req) {
      const body: Json = {
        prompt: req.prompt, format: formatFor(req), idempotency_key: req.idempotencyKey,
        export_on_complete: { enabled: true, format: "png", pixel_ratio: 2 },
        ...(req.brandKitId ? { brand_kit_id: req.brandKitId } : {}),
      };
      return taskFromJson(await call("/tasks", { method: "POST", body: JSON.stringify(body) }, "start task"));
    },
    async getTask(id) {
      if (!/^task_[0-9A-Za-z]{10,40}$/.test(id) && !/^[0-9a-f-]{36}$/i.test(id)) throw new VisualError("invalid_request", "bad task id");
      return taskFromJson(await call(`/tasks/${encodeURIComponent(id)}`, { method: "GET" }, "get task"));
    },
  };
}
