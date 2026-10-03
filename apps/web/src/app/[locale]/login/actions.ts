"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { memoryRateLimiter } from "@orbita/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";

const limiter = memoryRateLimiter(10, 15 * 60 * 1000); // swap for a shared store on Vercel
const Input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });

export async function loginAction(form: FormData) {
  const h = await headers();
  const locale = (h.get("referer")?.match(/\/(en|fr|es)\//)?.[1]) ?? "en";
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const parsed = Input.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = parsed.success ? parsed.data.email.toLowerCase() : "invalid";
  const [byIp, byEmail] = await Promise.all([limiter.hit("ip:" + ip), limiter.hit("email:" + email)]);
  if (!byIp.allowed || !byEmail.allowed) redirect(`/${locale}/login?error=rate`);
  if (!parsed.success) redirect(`/${locale}/login?error=invalid`);

  const captchaToken = String(form.get("cf-turnstile-response") ?? "");
  if (!captchaToken) redirect(`/${locale}/login?error=captcha`);

  // Supabase verifies the Turnstile token itself (Auth > Attack Protection > CAPTCHA),
  // so direct calls to the Supabase auth API cannot bypass the check either.
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ ...parsed.data, options: { captchaToken } });
  if (error) redirect(`/${locale}/login?error=${/captcha/i.test(error.message) ? "captcha" : "invalid"}`);
  redirect(`/${locale}/dashboard`);
}
