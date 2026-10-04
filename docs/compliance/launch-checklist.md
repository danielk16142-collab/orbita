# Launch checklist (privacy and legal)

## Fill the placeholders (`pnpm --filter @orbita/web legal:check --strict` must pass)
Company name, address, privacy contact and person in charge of personal information (Law 25 requires a designated person, and publishing their title and contact), effective date, governing law, data region, billing terms, subprocessor choices.

## Legal review
- [ ] Lawyer reviews Privacy Policy, Terms, DPA, Cookie Policy, AUP
- [ ] **French versions** (Quebec: consumer/adhesion contracts and public-facing policies are expected in French) and Spanish; translation by a qualified legal translator after the English text is final
- [ ] Liability cap, governing law, jurisdiction
- [ ] Verify each subprocessor's current terms (training, retention, location) and sign their DPAs
- [ ] Transfer assessment (Quebec) and SCCs (EU/UK)
- [ ] Privacy impact assessment (PIA) for the platform: AI processing, competitor research, cross-border hosting

## Product
- [x] Settings → Privacy: request form, account deletion, data export (built; test against a real Supabase project)
- [x] Invitation acceptance records consent in `legal_acceptances` with document versions (built)
- [x] Re-prompt users when a document version changes (`LEGAL_VERSIONS` in `apps/web/src/lib/legal.ts`)
- [ ] Disconnect account deletes tokens immediately (tested) (with connectors, phase 3)
- [ ] Retention jobs implemented for the schedule in the Privacy Policy (conversations 12 months, logs 12 months, offboarding purge)
- [ ] Backups: restore tested; confirm roll-off within 35 days
- [ ] Cookie audit still shows only essential cookies

## Platform app review (Meta, TikTok, LinkedIn, Google)
- [ ] Public Privacy Policy URL (`/en/legal/privacy-policy`) and Terms URL
- [ ] Data deletion instructions URL (`/en/legal/data-deletion`) and, for Meta, a deletion callback endpoint (build with the Meta connector)
- [ ] Minimum scopes only (read-only), with a written justification per scope (see `docs/connectors.md`)
- [ ] Screencast showing each permission in use
- [ ] Business verification complete

## Agent and AI
- [ ] Anthropic: confirm current terms for API data retention and model training; sign a DPA; record the region
- [ ] Privacy Policy section on AI processing reviewed by a lawyer (what is sent, retention, no training)
- [ ] Web research: confirm it is acceptable to send client brand context in search queries; keep AGENT_WEB_SEARCH=off if not
- [ ] Per-client daily token cap set to a sensible value; Anthropic workspace spend limit set on the agency key
- [ ] If offering client-owned keys: complete `docs/byok.md` (build, legal text, lawyer review)

## Connectors
- [ ] Meta and TikTok developer apps created; production redirect URIs, deauthorize and data-deletion URLs set (`docs/connectors.md`)
- [ ] Meta Business Verification and App Review (Advanced Access) completed before connecting clients' accounts; TikTok app review for the three scopes
- [ ] Privacy Policy lists the platform data read (followers, reach, post counts and captions) and the deletion routes
- [ ] `CRON_SECRET` set; cron schedule matches the hosting plan
- [ ] Test the Meta data-deletion callback and the Disconnect button end to end
