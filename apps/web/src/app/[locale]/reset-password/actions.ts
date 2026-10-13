"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, localeFrom } from "@/lib/session";
import { audit } from "@/lib/audit";

const Input = z.object({ password: z.string().min(10).max(72), confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"] });

/** Sets the new password. Needs the session from the reset link, and two-step verification when the account has it. */
export async function setPasswordAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireUser(locale, { skipTerms: true });
  const parsed = Input.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) redirect(`/${locale}/reset-password?error=${parsed.error.issues.some((i) => i.path[0] === "confirm") ? "mismatch" : "short"}`);
  const { error } = await s.sb.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const code = error.code === "weak_password" ? "weak" : error.code === "same_password" ? "same" : "failed";
    if (code === "failed") console.error(`password update failed: ${error.code ?? error.status ?? "?"}`);
    redirect(`/${locale}/reset-password?error=${code}`);
  }
  (await cookies()).delete("orbita_reset");
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "auth.password_reset" });
  redirect(`/${locale}/${s.profile.role === "client" ? "portal" : "dashboard"}`);
}
