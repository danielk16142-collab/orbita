"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, localeFrom } from "@/lib/session";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export type EnrollResult = { ok: true; factorId: string; qr: string; secret: string } | { ok: false };
export type VerifyState = { error?: "invalid" | "rate" } | undefined;

/** Starts TOTP enrollment. Drops any half-finished (unverified) factor first. */
export async function enrollAction(): Promise<EnrollResult> {
  const s = await getSession();
  if (!s) return { ok: false };
  if (!(await limiter("mfa-enroll", 5, 10 * 60_000).hit(s.user.id)).allowed) return { ok: false };
  const { data: list } = await s.sb.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.status === "unverified") await s.sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await s.sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { ok: false };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

const Code = z.object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });

export async function verifyAction(_prev: VerifyState, form: FormData): Promise<VerifyState> {
  const locale = localeFrom(form);
  const s = await getSession();
  if (!s) redirect(`/${locale}/login`);
  if (!(await limiter("mfa-verify", 6, 5 * 60_000).hit(s.user.id)).allowed) return { error: "rate" };
  const parsed = Code.safeParse({ factorId: form.get("factorId"), code: String(form.get("code") ?? "").replace(/\s/g, "") });
  if (!parsed.success) return { error: "invalid" };
  // The factor must belong to the signed-in user; Supabase enforces this, we also check.
  const { data: list } = await s.sb.auth.mfa.listFactors();
  if (!(list?.all ?? []).some((f) => f.id === parsed.data.factorId)) return { error: "invalid" };
  const { data: ch, error: e1 } = await s.sb.auth.mfa.challenge({ factorId: parsed.data.factorId });
  if (e1 || !ch) return { error: "invalid" };
  const { error: e2 } = await s.sb.auth.mfa.verify({ factorId: parsed.data.factorId, challengeId: ch.id, code: parsed.data.code });
  if (e2) { await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "mfa.verify_failed" }); return { error: "invalid" }; }
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "mfa.verified" });
  redirect(`/${locale}/dashboard`);
}
