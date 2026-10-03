import "server-only";

export type Email = { to: string; subject: string; text: string };

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
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Orbita <no-reply@example.com>", to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status})`);
}
