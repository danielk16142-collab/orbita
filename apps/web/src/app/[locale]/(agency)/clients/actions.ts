"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateInviteToken, hashInviteToken } from "@orbita/security/invitation";
import { getTranslations } from "next-intl/server";
import { localeFrom, requireAdmin, requireStaff } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const Uuid = z.string().uuid();
const Locales = z.array(z.enum(["en", "fr", "es"])).min(1);

export async function createClientAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireStaff(locale);
  const parsed = z.object({
    name: z.string().trim().min(1).max(120),
    languages: Locales,
    markets: z.string().max(300),
  }).safeParse({ name: form.get("name"), languages: form.getAll("languages"), markets: String(form.get("markets") ?? "") });
  if (!parsed.success) redirect(`/${locale}/clients?error=1`);
  const { name, languages, markets } = parsed.data!;
  const { data, error } = await s.sb.from("clients").insert({
    agency_id: s.profile.agency_id, name, languages,
    markets: markets.split(",").map((m) => m.trim()).filter(Boolean).slice(0, 20),
  }).select("id").single();
  if (error || !data) redirect(`/${locale}/clients?error=1`);
  await s.sb.from("brand_briefs").insert({ client_id: data!.id });
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "client.created", entity: "client", entityId: data!.id });
  redirect(`/${locale}/clients/${data!.id}`);
}

export async function deleteClientAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireAdmin(locale);
  const id = Uuid.parse(form.get("clientId"));
  const { data: c } = await s.sb.from("clients").select("name").eq("id", id).single();
  // Typing the exact name guards against accidental deletion.
  if (!c || String(form.get("confirm") ?? "") !== c.name) redirect(`/${locale}/clients/${id}?error=confirm`);
  const admin = supabaseAdmin();
  const { data: files } = await admin.storage.from("client-logos").list(id);
  if (files?.length) await admin.storage.from("client-logos").remove(files.map((f) => `${id}/${f.name}`));
  // Client users' accounts are removed with the client (profiles cascade); delete their auth users too.
  const { data: users } = await admin.from("profiles").select("user_id").eq("client_id", id);
  const { error } = await s.sb.from("clients").delete().eq("id", id);
  if (error) redirect(`/${locale}/clients/${id}?error=1`);
  for (const u of users ?? []) await admin.auth.admin.deleteUser(u.user_id);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "client.deleted", entity: "client", entityId: id });
  redirect(`/${locale}/clients`);
}

export async function inviteAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireStaff(locale);
  const parsed = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(["client", "team", "admin"]),
    clientId: Uuid.optional().or(z.literal("")),
  }).safeParse({ email: form.get("email"), role: form.get("role"), clientId: form.get("clientId") ?? "" });
  const back = (q: string) => `/${locale}/clients${parsed.success && parsed.data.clientId ? `/${parsed.data.clientId}?tab=users&` : "?"}${q}`;
  if (!parsed.success) redirect(back("error=email"));
  const { email, role, clientId } = parsed.data!;
  if (role === "client" && !clientId) redirect(back("error=email"));
  if (role !== "client" && s.profile.role !== "admin") redirect(back("error=forbidden"));
  if (!(await limiter("invite-create", 20, 60 * 60_000).hit(s.user.id)).allowed) redirect(back("error=rate"));

  const token = generateInviteToken();
  // RLS re-checks everything: same agency, client belongs to agency, only admins invite staff.
  const { data, error } = await s.sb.from("invitations").insert({
    agency_id: s.profile.agency_id, client_id: role === "client" ? clientId : null, email, role, token_hash: hashInviteToken(token),
  }).select("id").single();
  if (error || !data) redirect(back("error=forbidden"));

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const t = await getTranslations({ locale, namespace: "email" });
  try {
    await sendEmail({ to: email, subject: t("inviteSubject"), text: t("inviteBody", { link: `${base}/${locale}/invite/${token}` }) });
  } catch {
    await s.sb.from("invitations").delete().eq("id", data!.id); // don't leave a live token nobody received
    redirect(back("error=1"));
  }
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "invitation.created", entity: "invitation", entityId: data!.id, meta: { role } });
  redirect(back("invited=1"));
}

export async function revokeInvitationAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireStaff(locale);
  const id = Uuid.parse(form.get("id")), clientId = Uuid.parse(form.get("clientId"));
  await s.sb.from("invitations").delete().eq("id", id); // RLS: own agency, pending only
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "invitation.revoked", entity: "invitation", entityId: id });
  redirect(`/${locale}/clients/${clientId}?tab=users`);
}
