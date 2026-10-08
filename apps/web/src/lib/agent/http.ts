import "server-only";

/** Browsers always send Origin on cross-site and same-site POSTs. We require it to match our own host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host")); } catch { return false; }
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/**
 * A log-safe description of a failed model call: error class, HTTP status, the provider's error type and message,
 * and the request id. Never includes the request body, the prompt, keys or headers. The browser only ever sees a generic code.
 */
export function describeModelError(e: unknown): string {
  if (!(e instanceof Error)) return "unknown error";
  const x = e as Error & { status?: number; requestID?: string | null; error?: { error?: { type?: string; message?: string } } };
  const inner = x.error?.error;
  return [x.name, x.status && `status=${x.status}`, inner?.type && `type=${inner.type}`, `message=${(inner?.message ?? x.message).replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]").slice(0, 300)}`, x.requestID && `request=${x.requestID}`].filter(Boolean).join(" ");
}
