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
- [ ] Minimum scopes only, with a written justification per scope
- [ ] Screencast showing each permission in use
- [ ] Business verification complete
