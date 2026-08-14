# RepairTrack Testing Checklist

## Authentication

- [ ] Admin can log in using admin/admin123.
- [ ] Technician can log in using tech/tech123.
- [ ] Invalid credentials are rejected.
- [ ] Logout ends the session.

## Device Intake

- [ ] Admin can create a new ticket.
- [ ] Ticket reference begins with RT-.
- [ ] Required fields are enforced.
- [ ] Ticket appears in the ticket list.

## Assignment and Workflow

- [ ] Admin can assign a technician.
- [ ] Technician can view assigned tickets.
- [ ] Technician cannot view tickets assigned to another technician.
- [ ] Status can be updated.

## Notes and History

- [ ] Diagnostic note can be added.
- [ ] Repair note appears in service history.
- [ ] Notes are timestamped and linked to a user.

## Customer Lookup

- [ ] Customer can enter a valid reference.
- [ ] Public page shows limited repair status only.
- [ ] Invalid reference shows an error message.

## Reports and Audit

- [ ] Reports page shows status metrics.
- [ ] CSV export downloads a file.
- [ ] Audit page records login, create ticket, update ticket, and notes.

## Smoke Test

```bash
php tests/smoke_test.php
```

Expected: all tests pass.
