# Technician manual

## Start work

1. Set the password through the secure invitation and sign in.
2. Dashboard and Repairs show only work assigned to you.
3. Open a ticket, verify the physical device/reference, and select Accept job.

## Update a repair

- Add diagnosis and repair information only to the correct ticket.
- Use internal notes for workshop detail; choose customer visibility only for text suitable for the customer.
- Image fields accept hosted HTTPS image URLs. Never upload secrets or unrelated personal data.
- Add parts through the repair inventory action. This atomically decreases stock, records the technician/price/quantity, and prevents unauthorized negative stock.
- Follow permitted status transitions. Add a clear customer message when approval, parts, testing, completion, or collection action is relevant.
- If testing fails, return to In Progress rather than skipping the workflow.

## Restrictions

Technicians cannot create administrators, manage tenants, alter global settings, view unassigned repair details, access customer invoices/payment operations, delete audit logs, or override negative stock. Attempts are rejected by the API and may be audited.

## Offline Android use

Assigned repairs and appropriate inventory references are cached. Status/note changes made during a network failure can queue for WorkManager sync. Check the pending indicator and resolve server conflicts after reconnection. Financial actions always require online confirmation.
