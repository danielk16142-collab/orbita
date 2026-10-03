# Data Processing Agreement

**Version:** 0.1 (draft, requires legal review) · applies where we process personal data on behalf of an agency or business ("**Customer**") using Orbita.

## 1. Roles
The Customer is the controller (GDPR) / the organization responsible for personal information (Quebec Law 25, PIPEDA); [[COMPANY_NAME]] ("**Provider**") is the processor / service provider. This agreement forms part of the Terms of Service.

## 2. Subject matter
Processing of Customer Data to provide Orbita: hosting, dashboards, content planning, platform connections, the AI agent. Types of personal data: contact and account details of Customer users, public social-media account information, audience metrics (mostly aggregated), comments, content. Data subjects: Customer's personnel, its clients' personnel, social-media audiences and public figures whose public information appears.

## 3. Provider obligations
- Process personal data only on the Customer's documented instructions (the service and its configuration), unless law requires otherwise.
- Ensure personnel are bound by confidentiality.
- Apply the security measures in Annex A.
- Help the Customer respond to rights requests, security incidents and impact assessments, as reasonably required.
- Notify the Customer **without undue delay and within 72 hours** of becoming aware of a confidentiality incident involving Customer personal data.
- Use only the subprocessors on the Subprocessors page under written terms no less protective; give at least **30 days' notice** of new ones, which the Customer may object to on reasonable data-protection grounds.
- On termination, return (export) and then delete Customer Data within 30 days, except where retention is required by law; backups roll off within 35 days.
- Make available information needed to show compliance and allow reasonable audits (by questionnaire and reports first; on-site only where legally required), at the Customer's cost.

## 4. Customer obligations
Have a lawful basis and any required notices or consents for the data it loads or connects; have authority to connect accounts; configure users and roles appropriately; not instruct unlawful processing.

## 5. International transfers
Where personal data from the EEA, UK or Switzerland is transferred to a country without an adequacy decision, the parties rely on the Standard Contractual Clauses (module 2 controller→processor, module 3 where applicable), incorporated by reference. For Quebec, the Customer remains responsible for its assessment, and the Provider will help provide information about safeguards. [[LEGAL_REVIEW: transfer mechanism and annexes.]]

## 6. Liability
Subject to the liability terms of the Terms of Service.

## Annex A: Security measures (summary)
Encryption in transit and at rest; envelope encryption of platform tokens; default-deny row-level security with automated tenant-isolation tests; role-based access (admin, team, client); MFA for staff; bot protection and rate limiting; CSP and security headers; SSRF protection for fetched links; AI prompt-injection safeguards and human confirmation for state-changing agent actions; audit logging; separated environments; dependency and secret scanning in CI; backups with tested restores.
