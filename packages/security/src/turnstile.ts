/**
 * Server-side verification of a Cloudflare Turnstile token.
 * The widget alone proves nothing: the token MUST be verified here, with the secret key,
 * on every protected request. Tokens are single-use and expire after 5 minutes.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { success: boolean; errors: string[] };

export async function verifyTurnstile(
  token: string | null | undefined,
  opts: { secret?: string; remoteIp?: string; expectedAction?: string; fetchImpl?: typeof fetch } = {},
): Promise<TurnstileResult> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: false, errors: ["missing-secret"] }; // fail closed
  if (!token || token.length > 2048) return { success: false, errors: ["missing-input-response"] };

  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp) body.set("remoteip", opts.remoteIp);

  try {
    const res = await (opts.fetchImpl ?? fetch)(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { success: false, errors: ["verify-http-" + res.status] };
    const data = (await res.json()) as { success?: boolean; action?: string; "error-codes"?: string[] };
    if (!data.success) return { success: false, errors: data["error-codes"] ?? ["unknown"] };
    if (opts.expectedAction && data.action !== opts.expectedAction) {
      return { success: false, errors: ["action-mismatch"] };
    }
    return { success: true, errors: [] };
  } catch {
    return { success: false, errors: ["verify-unreachable"] }; // fail closed
  }
}
