import { headers } from "next/headers";
import { verifyTurnstile } from "@orbita/security/turnstile";

/**
 * Use in any server action or route handler reachable without a session (invitation
 * acceptance, contact forms...). Reads the widget's "cf-turnstile-response" field and
 * verifies it server-side with the caller's IP. Returns false (fail closed) on any problem.
 * NOTE: the login form is verified by Supabase itself; tokens are single-use, so do not
 * verify the same token twice.
 */
export async function passesTurnstile(form: FormData, action: string): Promise<boolean> {
  const h = await headers();
  const remoteIp = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const token = form.get("cf-turnstile-response");
  const r = await verifyTurnstile(typeof token === "string" ? token : null, { remoteIp, expectedAction: action });
  return r.success;
}
