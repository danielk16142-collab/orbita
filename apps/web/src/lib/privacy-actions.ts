"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { localeFrom, requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { limiter } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const Kinds = ["access", "export", "correct", "delete", "restrict", "withdraw_consent"] as const;
const dest = (locale: string, role: string) => role === "client" ? `/${locale}/portal/settings/privacy` : `/${locale}/settings/privacy`;

export async function createRequestAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireUser(locale);
  const back = dest(locale, s.profile.role);
  const parsed = z.object({ kind: z.enum(Kinds), details: z.string().trim().max(4000) })
    .safeParse({ kind: form.get("kind"), details: String(form.get("details") ?? "") });
  if (!parsed.success) redirect(`${back}?error=1`);
  if (!(await limiter("privacy-request", 5, 24 * 60 * 60_000).hit(s.user.id)).allowed) redirect(`${back}?error=rate`);
  const { error } = await s.sb.from("data_requests").insert({
    agency_id: s.profile.agency_id, client_id: s.profile.client_id, requester_id: s.user.id,
    kind: parsed.data!.kind, details: parsed.data!.details || null,
  });
  if (error) redirect(`${back}?error=1`);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "privacy.request_created", meta: { kind: parsed.data!.kind } });
  redirect(`${back}?submitted=1`);
}

/** Admins work the queue. The database trigger limits what can change (status and resolution only). */
export async function updateRequestAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireUser(locale);
  if (s.profile.role !== "admin") redirect(dest(locale, s.profile.role));
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["received", "verifying", "in_progress", "completed", "rejected"]),
    note: z.string().trim().max(2000),
  }).safeParse({ id: form.get("id"), status: form.get("status"), note: String(form.get("note") ?? "") });
  if (!parsed.success) redirect(`${dest(locale, "admin")}?error=1`);
  const done = parsed.data!.status === "completed" || parsed.data!.status === "rejected";
  await s.sb.from("data_requests").update({
    status: parsed.data!.status, resolution_note: parsed.data!.note || null, resolved_at: done ? new Date().toISOString() : null,
  }).eq("id", parsed.data!.id);
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "privacy.request_updated", entity: "data_request", entityId: parsed.data!.id, meta: { status: parsed.data!.status } });
  redirect(`${dest(locale, "admin")}?saved=1`);
}

/**
 * Self-service account deletion. Removes the sign-in and personal profile; consent and request
 * records stay (de-identified, user id only) for the legal retention period.
 */
export async function deleteAccountAction(form: FormData) {
  const locale = localeFrom(form);
  const s = await requireUser(locale); // already forces MFA verification when a factor exists
  const back = dest(locale, s.profile.role);
  if (String(form.get("confirm") ?? "") !== "DELETE") redirect(`${back}?error=badConfirm`);
  if (!(await limiter("account-delete", 3, 60 * 60_000).hit(s.user.id)).allowed) redirect(`${back}?error=rate`);

  const admin = supabaseAdmin();
  if (s.profile.role === "admin") {
    const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("agency_id", s.profile.agency_id).eq("role", "admin");
    if ((count ?? 0) <= 1) redirect(`${back}?error=soleAdmin`);
  }
  await audit({ agencyId: s.profile.agency_id, actor: s.user.id, action: "account.deleted", entity: "user", entityId: s.user.id });
  const { error } = await admin.auth.admin.deleteUser(s.user.id); // profile cascades; consent/request records are kept
  if (error) redirect(`${back}?error=1`);
  await s.sb.auth.signOut();
  redirect(`/${locale}/login`);
}
