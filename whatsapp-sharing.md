# WhatsApp sharing and full-project Kanban

## Requested outcome

Add click-to-chat WhatsApp buttons for repair, website, software and AI-agent tracking links, and for invoices. Opening a draft is not automatic delivery: the operator must press Send in WhatsApp. Retain the current layout, functionality and optional provider-based automation.

Expand the existing GitHub project board into a clearly identified retrospective of the complete project, using repository evidence for completed work and leaving unfinished work open. Do not fabricate historical dates or completion evidence.

## Implementation and ownership

- Root: shared phone/link/message utility, reusable WhatsApp button, helper tests, release verification and board updates.
- Tracking UI worker: repair and digital intake/detail screens and UI tests; retain the intake customer's contact after form resets.
- Invoice/backend worker: authorized, secure invoice-sharing API and relevant DTO support/tests; invoice page button and tests. Public invoice links must be unguessable, scoped, expiring and non-cacheable, with no authentication bypass on normal invoice routes.
- Evidence worker: read-only mapping of the full project lifecycle to source evidence and a retrospective Kanban manifest/document.

## Security boundaries

- Prefer the recorded WhatsApp number, otherwise the customer's phone; validate and normalize international numbers.
- Encode messages and URLs; only allow intended first-party tracking/invoice links. Use safe external navigation without opener/referrer leakage.
- Never log private tracking/share tokens or mark a manual click as a sent notification.
- Do not send real customer messages during testing, expose secrets, or alter unrelated user documents.
- Keep automatic WhatsApp consent and provider controls intact; manual sharing is a separate operator action.

## Verification and release

- Unit/UI tests for all service types, contact selection, invoice access/expiry, invalid numbers, URL encoding and role restrictions.
- Run type checks, tests, lint/build and dependency checks in proportion to the changes.
- Commit only scoped changes, push the existing GitHub release workflow and verify both Vercel deployments.
- Update the existing board with evidence-backed tasks and current release status; report any unresolved setup explicitly.

## Status

Implementation and local verification complete: 173 backend tests and 111 web tests passed, with lint, type checks and production builds. Seven isolated browser checks cover all four ticket categories, one-click invoice sharing, mobile layout and customer-role restrictions; no real messages were sent. Dependency audit found no known advisories among 666 dependencies, and the tracked-source credential-pattern scan found no matches. These checks are not a security guarantee.

Existing release baseline is 80eaa84743aa0e4d776d370e483f6c51b7556ed6. GitHub release and matching Vercel production verification remain the final release gate. The board contains 20 linked issues; #23 tracks this release and #24 keeps optional integrations and operational acceptance open. See the release issue for post-deployment evidence.
