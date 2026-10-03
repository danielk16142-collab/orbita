"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashInviteToken, isWellFormedToken } from "@orbita/security/invitation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { passesTurnstile } from "@/lib/turnstile-guard";
import { limiter } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request-context";
import { audit } from "@/lib/audit";
import { localeFrom } from "@/lib/session";
import { LEGAL_VERSIONS, REQUIRED_ACCEPTANCES } from "@/lib/legal";

const Input = z.object({
  token: z.string().refine(isWellFormedToken),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(256),
});

/**
 * Accepts an invitation. The role, agency and client come ONLY from the invitation row,
 * never from the form. The invitation is claimed atomically (used_at set where still null)
 * before anything is created, so a token can't be used twice even with parallel requests.
 */
export async function acceptInviteAction(form: FormData) {
  const locale = localeFrom(form);
  const token = String(form.get("token") ?? "");
  const back = (error: string) => redirect(`/${locale}/invite/${isWellFormedToken(token) ? token : "x"}?error=${error}`);
  const { ip, userAgent } = await requestContext();

  if (!(await limiter("invite-accept", 8, 15 * 60_000).hit(ip ?? "unknown")).allowed) back("rate");
  if (!(await passesTurnstile(form, "invite"))) back("captcha");
  if (form.get("accept") !== "on") back("accept");
  const parsed = Input.safeParse({ token, name: form.get("name"), password: form.get("password") });
  if (!parsed.success) back(parsed.error.issues.some((i) => i.path[0] === "password") ? "weak" : "failed");
  const input = parsed.data!;

  const admin = supabaseAdmin();
  const { data: inv } = await admin.from("invitations").update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashInviteToken(input.token)).is("used_at", null).gt("expires_at", new Date().toISOString())
    .select("id, agency_id, client_id, email, role").maybeSingle();
  if (!inv) back("failed");
  const i = inv!;

  const release = () => admin.from("invitations").update({ used_at: null }).eq("id", i.id);
  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email: i.email, password: input.password, email_confirm: true });
  if (userErr || !created.user) { await release(); back("failed"); }
  const userId = created!.user!.id;

  const { error: profErr } = await admin.from("profiles").insert({
    user_id: userId, agency_id: i.agency_id, client_id: i.client_id, role: i.role, full_name: input.name, locale,
  });
  const { error: accErr } = profErr ? { error: profErr } : await admin.from("legal_acceptances").insert(
    REQUIRED_ACCEPTANCES.map((document) => ({ user_id: userId, agency_id: i.agency_id, document, version: LEGAL_VERSIONS[document], ip, user_agent: userAgent })));
  if (profErr || accErr) {
    await admin.auth.admin.deleteUser(userId); // no half-created accounts
    await release();
    back("failed");
  }

  await audit({ agencyId: i.agency_id, actor: userId, action: "invitation.accepted", entity: "invitation", entityId: i.id, meta: { role: i.role } });
  redirect(`/${locale}/login?welcome=1`);
}
