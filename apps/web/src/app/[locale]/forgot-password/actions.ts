"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { limiter as getLimiter } from "@/lib/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { appUrl } from "@/lib/connectors/accounts";
import { localeFrom } from "@/lib/session";

const limiter = getLimiter("password-reset", 5, 60 * 60 * 1000);

/**
 * Sends the reset link. The answer is the same whether or not the email has an account, so the form
 * cannot be used to find out who uses Orbita. Supabase also checks the Turnstile token.
 */
export async function requestResetAction(form: FormData) {
  const locale = localeFrom(form);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const parsed = z.string().email().max(254).safeParse(form.get("email"));
  const email = parsed.success ? parsed.data.toLowerCase() : "invalid";
  const [byIp, byEmail] = await Promise.all([limiter.hit("ip:" + ip), limiter.hit("email:" + email)]);
  if (!byIp.allowed || !byEmail.allowed) redirect(`/${locale}/forgot-password?error=rate`);
  if (!parsed.success) redirect(`/${locale}/forgot-password?error=invalid`);
  const captchaToken = String(form.get("cf-turnstile-response") ?? "");
  if (!captchaToken) redirect(`/${locale}/forgot-password?error=captcha`);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/api/auth/recovery?locale=${locale}`, captchaToken });
  if (error && /captcha/i.test(error.message)) redirect(`/${locale}/forgot-password?error=captcha`);
  if (error) console.error(`password reset request failed: ${error.code ?? error.status ?? "?"}`);
  redirect(`/${locale}/forgot-password?sent=1`);
}
