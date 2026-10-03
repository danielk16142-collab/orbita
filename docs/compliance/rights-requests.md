# Handling data-subject requests

**Deadline: 30 days** from receipt (`data_requests.due_at`). Extensions only where the law allows, with notice to the requester.

1. **Intake.** Requests arrive via Settings → Privacy (creates a `data_requests` row, status `received`) or by email to the privacy address. Log emailed requests in the table the same day.
2. **Verify identity.** Confirm the requester controls the account email. For third parties or unclear cases ask for more proof; never ask for more data than needed. Status `verifying`.
3. **Controller check.** If the data sits in an agency's client workspace, the agency is the controller: forward the request to the agency admin within 5 days and tell the requester.
4. **Fulfil** (status `in_progress`):
   - *Access/export:* machine-readable export (JSON/CSV) of the person's data across tables in the data map; deliver by a secure expiring link.
   - *Correct:* fix the data or explain why not.
   - *Delete:* delete from the database and storage, disconnect and delete tokens, remove from the AI conversation history; backups roll off within 35 days. Keep only records the law requires (billing, `legal_acceptances`, `data_requests`).
   - *Restrict/object/withdraw consent:* apply the change and stop the processing concerned.
5. **Close.** Set `completed` or `rejected` with a `resolution_note`, send written confirmation, keep the record 3 years.
6. **Report.** Review overdue requests weekly. Track counts and times for the annual privacy report.
