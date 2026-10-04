import { ConnectorApiError, ConnectorAuthError, ConnectorRateLimitError } from "./types";

/** Turn an HTTP/JSON failure into a typed, secret-free error. Request URLs (which can carry tokens) are never included. */
export async function readJson(res: Response, what: string): Promise<any> {
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON body */ }
  const err = body?.error;
  const code = typeof err === "object" ? (err?.code ?? err?.type) : err;
  if (res.status === 401 || res.status === 403 || code === 190 || code === "access_token_invalid" || code === "invalid_grant" || code === "scope_not_authorized" || code === "OAuthException")
    throw new ConnectorAuthError(`${what}: authorization is no longer valid`);
  if (res.status === 429 || code === "rate_limit_exceeded" || code === 4 || code === 17 || code === 32 || code === 613)
    throw new ConnectorRateLimitError(`${what}: rate limited`, Number(res.headers.get("retry-after")) || 60);
  if (!res.ok || (typeof err === "object" && err && err.code && err.code !== "ok")) throw new ConnectorApiError(`${what}: request failed (${res.status})`);
  return body;
}

export const form = (o: Record<string, string>) => new URLSearchParams(o);
export const day = (d: Date) => d.toISOString().slice(0, 10);
export const unix = (d: Date) => Math.floor(d.getTime() / 1000);
