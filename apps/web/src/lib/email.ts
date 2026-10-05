import "server-only";

export type Email = { to: string; subject: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * HTML version of a plain-text email: escaped paragraphs under the Orbita logo (PNG, because many mail apps block SVG).
 * Links in the text are made clickable. The plain-text part is still sent as the fallback.
 */
export function emailHtml(text: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const logo = base.startsWith("https://") ? `<img src="${esc(base)}/brand/orbita-logo.png" alt="Orbita" width="180" style="display:block;margin:0 0 24px;height:auto;border:0">` : `<p style="font:700 22px Arial,sans-serif;margin:0 0 24px">Orbita</p>`;
  const linkify = (s: string) => esc(s).replace(/(https:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#c83a0e">${u}</a>`);
  const paras = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${linkify(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f1ec"><div style="max-width:560px;margin:0 auto;padding:32px 24px;font:16px/1.5 Arial,sans-serif;color:#111">${logo}${paras}</div></body></html>`;
}

/**
 * Sends through Resend when RESEND_API_KEY is set. In development without a key the message
 * is printed to the server console. In production a missing key is an error: invitations
 * must never be silently dropped (or leaked to logs).
 */
export async function sendEmail(mail: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("Email provider is not configured");
    console.info(`[dev email] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Orbita <no-reply@example.com>", to: [mail.to], subject: mail.subject, text: mail.text, html: emailHtml(mail.text) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status})`);
}
