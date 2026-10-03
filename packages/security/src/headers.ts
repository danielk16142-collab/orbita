/** Security headers applied to every response. `nonce` is generated per request in middleware. */
export function securityHeaders(nonce: string, opts: { supabaseUrl?: string; dev?: boolean } = {}) {
  const supabase = opts.supabaseUrl ? new URL(opts.supabaseUrl).origin : "";
  const csp = [
    "default-src 'self'",
    // Turnstile loads its script and iframe from Cloudflare.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${opts.dev ? " 'unsafe-eval'" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + supabase,
    `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")} https://challenges.cloudflare.com`.trim(),
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  } as Record<string, string>;
}
