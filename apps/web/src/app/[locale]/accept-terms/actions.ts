"use server";
import { redirect } from "next/navigation";
import { localeFrom, requireUser } from "@/lib/session";
import { LEGAL_VERSIONS, REQUIRED_ACCEPTANCES } from "@/lib/legal";
import { requestContext } from "@/lib/request-context";
import { audit } from "@/lib/audit";

export async function acceptTermsAction(form: FormData) {
  const locale = localeFrom(form);
  const { sb, user, profile } = await requireUser(locale, { skipTerms: true });
  if (form.get("accept") !== "on") redirect(`/${locale}/accept-terms?error=1`);
  const { ip, userAgent } = await requestContext();
  const rows = REQUIRED_ACCEPTANCES.map((document) => ({
    user_id: user.id, agency_id: profile.agency_id, document, version: LEGAL_VERSIONS[document], ip, user_agent: userAgent,
  }));
  const { error } = await sb.from("legal_acceptances").upsert(rows, { onConflict: "user_id,document,version", ignoreDuplicates: true });
  if (error) redirect(`/${locale}/accept-terms?error=1`);
  await audit({ agencyId: profile.agency_id, actor: user.id, action: "legal.accepted", meta: LEGAL_VERSIONS });
  redirect(`/${locale}/dashboard`);
}
