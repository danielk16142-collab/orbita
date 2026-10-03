# Confidentiality incident response

A confidentiality incident is unauthorized access to, use of, or disclosure of personal information, or its loss. Examples: leaked token, cross-tenant data exposure, compromised staff account.

## Roles
Incident lead: [[PRIVACY_OFFICER]]. Backup: [[BACKUP_CONTACT]].

## Steps
1. **Contain (first hour).** Revoke affected sessions and keys; rotate the Supabase service-role key, `ORBITA_MASTER_KEY` (re-wrap data keys), Turnstile secret and any exposed platform tokens; disable the affected feature if needed.
2. **Assess.** What data, whose, how many people, how long, in which jurisdictions. Use `audit_log`, hosting logs and provider logs. Preserve evidence.
3. **Decide on risk of serious harm** (Law 25) / risk to rights and freedoms (GDPR). Record the reasoning in the **incident register** (required by Law 25 even when no notice is sent).
4. **Notify.**
   - Agencies/clients (controllers): **without undue delay, within 72 hours** of awareness, per the DPA.
   - Quebec: the Commission d'accès à l'information and affected individuals **promptly** if risk of serious harm.
   - Canada (PIPEDA): the Privacy Commissioner and individuals if real risk of significant harm; keep records 24 months.
   - EU/UK: the supervisory authority **within 72 hours** if risk to individuals; individuals if high risk.
   - Platforms (Meta/TikTok/etc.) where their terms require notice for compromised tokens.
5. **Recover and fix.** Patch root cause, add a regression test (for isolation bugs, add to `supabase/tests/isolation.sql`), restore from backup if required.
6. **Review.** Post-incident review within 14 days; update controls and this document.
