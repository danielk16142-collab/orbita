import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { LEGAL_VERSIONS, REQUIRED_ACCEPTANCES } from "./legal";

export type Role = "admin" | "team" | "client";
export type Profile = { user_id: string; agency_id: string; client_id: string | null; role: Role; full_name: string | null; locale: string };

export const getSession = cache(async () => {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser(); // validates the token with Supabase, not just the cookie
  if (!user) return null;
  const { data: profile } = await sb.from("profiles").select("user_id, agency_id, client_id, role, full_name, locale").eq("user_id", user.id).single();
  if (!profile) return null;
  return { sb, user, profile: profile as Profile };
});

async function hasAcceptedCurrentTerms(sb: Awaited<ReturnType<typeof supabaseServer>>, userId: string) {
  const { data } = await sb.from("legal_acceptances").select("document, version").eq("user_id", userId);
  const have = new Set((data ?? []).map((r) => `${r.document}@${r.version}`));
  return REQUIRED_ACCEPTANCES.every((d) => have.has(`${d}@${LEGAL_VERSIONS[d]}`));
}

/** Any signed-in user with a profile. Redirects to login otherwise. */
export async function requireUser(locale: string, opts: { skipTerms?: boolean; skipMfa?: boolean } = {}) {
  const s = await getSession();
  if (!s) redirect(`/${locale}/login`);
  if (!opts.skipMfa) {
    // Anyone who has enrolled a factor must use it (not just staff).
    const { data } = await s.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") redirect(`/${locale}/security/mfa`);
  }
  if (!opts.skipTerms && !(await hasAcceptedCurrentTerms(s.sb, s.user.id))) redirect(`/${locale}/accept-terms`);
  return s;
}

/**
 * Agency staff (admin/team). Enforces MFA: staff without a factor are sent to enroll, and
 * staff with a factor must have verified it in this session (AAL2). Call this in every
 * staff page AND every staff server action: it is the enforcement point.
 */
export async function requireStaff(locale: string) {
  const s = await requireUser(locale);
  if (s.profile.role === "client") redirect(`/${locale}/portal`);
  const { data } = await s.sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal2") redirect(`/${locale}/security/mfa`);
  return s;
}

export async function requireAdmin(locale: string) {
  const s = await requireStaff(locale);
  if (s.profile.role !== "admin") redirect(`/${locale}/dashboard`);
  return s;
}

/** A client portal user. Staff are sent to the agency dashboard. */
export async function requireClientUser(locale: string) {
  const s = await requireUser(locale);
  if (s.profile.role !== "client" || !s.profile.client_id) redirect(`/${locale}/dashboard`);
  return s as typeof s & { profile: Profile & { client_id: string } };
}

export function localeFrom(form: FormData): "en" | "fr" | "es" {
  const l = String(form.get("locale") ?? "en");
  return l === "fr" || l === "es" ? l : "en";
}
