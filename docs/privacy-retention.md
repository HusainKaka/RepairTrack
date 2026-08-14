# Privacy, consent, and retention

RepairTrack should be operated in line with the Kenya Data Protection Act, 2019 and applicable regulations. This document is an engineering baseline, not legal advice; the deploying organization must obtain qualified legal review.

## Data minimization and purpose

Collect only customer identity/contact data, device identification/condition, repair communications, and billing evidence needed to deliver and account for the service. The default schema deliberately has no device-password/passcode field. Do not put passcodes, card data, national IDs, or unrelated sensitive material in notes/images.

Provide a privacy notice at collection explaining controller/processor identity, purposes, recipients/providers, retention, cross-border transfer where applicable, security measures, and data-subject rights. Record consent where consent is the lawful basis; do not use repair-service consent for unrelated marketing.

## Suggested retention schedule

The business must approve exact periods based on law/contracts:

- Active account and repair operational data: while service/account is active.
- Completed repair detail and customer communications: a documented warranty/dispute period, then minimize or delete.
- Invoices, payments, receipts, and necessary tax records: statutory financial-retention period.
- Security/audit logs: long enough for accountability/investigation, with restricted access and periodic archive/deletion.
- Password reset/email verification tokens: delete after use or expiry.
- Revoked sessions: short fraud/investigation window, then delete.
- Push tokens: revoke on logout/account deletion and purge stale registrations.
- Backups: fixed encrypted rotation; expired copies destroyed and deletions age out predictably.

## Account deletion workflow

`DELETE /auth/account` marks `DELETION_REQUESTED`, revokes active sessions, clears the browser cookie, and writes an audit event. An authorized privacy reviewer must then verify identity, locate tenant-linked data, preserve only legally required records, anonymize where possible, delete eligible data/exports/provider records, record completion, and notify the requester.

Deletion must not destroy audit/financial integrity or another person's data. Access to deletion tooling should be dual-controlled and audited.

## Security and breach handling

Use least privilege, encryption in transit/at rest, secret management, backups, provider agreements, staff training, incident monitoring, and tenant isolation tests. Maintain an incident plan covering containment, evidence, risk assessment, required regulator/data-subject notifications, credential rotation, and corrective actions.

Respond to access/correction/objection/portability/deletion requests through a documented identity-verified process and within applicable timelines.
