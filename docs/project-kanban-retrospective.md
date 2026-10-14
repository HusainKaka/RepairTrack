# RepairTrack full-project Kanban retrospective

**Retrospective record created 2026-10-14 based on repository evidence.** This document reconstructs the project's logical phases; it does not claim these cards, dates or board activity existed at the start of development. Do not backdate issues, invent sprint dates, or manufacture test results.

Board: [RepairTrack — Complete Project Roadmap](https://github.com/users/HusainKaka/projects/6). Repository baseline reviewed: `80eaa84743aa0e4d776d370e483f6c51b7556ed6`.

## Live board verification

On 2026-10-14, the authenticated GitHub interface confirmed **20 repository-linked issues: 18 Done, one In progress and one Backlog**. The original six upgrade issues were retained. Twelve new retrospective issues were created and marked Done; the existing project workflow closed them as completed on the actual creation day. No historical dates were fabricated.

The board remains **private**; ownership, access and workflows were not changed. Empty Ready/In review columns were hidden from this view for readability, not deleted. The current enhancement stays open until its own release is verified.

| Manifest | GitHub issue | Verified status |
|---|---|---|
| RT-01 | [#11](https://github.com/HusainKaka/RepairTrack/issues/11) | Done / closed |
| RT-02 | [#12](https://github.com/HusainKaka/RepairTrack/issues/12) | Done / closed |
| RT-03 | [#13](https://github.com/HusainKaka/RepairTrack/issues/13) | Done / closed |
| RT-04 | [#14](https://github.com/HusainKaka/RepairTrack/issues/14) | Done / closed |
| RT-05 | [#15](https://github.com/HusainKaka/RepairTrack/issues/15) | Done / closed |
| RT-06 | [#16](https://github.com/HusainKaka/RepairTrack/issues/16) | Done / closed |
| RT-07 | [#17](https://github.com/HusainKaka/RepairTrack/issues/17) | Done / closed |
| RT-08 | [#18](https://github.com/HusainKaka/RepairTrack/issues/18) | Done / closed |
| RT-09 | [#19](https://github.com/HusainKaka/RepairTrack/issues/19) | Done / closed |
| RT-10 | [#20](https://github.com/HusainKaka/RepairTrack/issues/20) | Done / closed |
| RT-11 | [#21](https://github.com/HusainKaka/RepairTrack/issues/21) | Done / closed |
| RT-12 | [#22](https://github.com/HusainKaka/RepairTrack/issues/22) | Done / closed |
| RT-13 | [#5](https://github.com/HusainKaka/RepairTrack/issues/5) | Done / closed; reused |
| RT-14 | [#6](https://github.com/HusainKaka/RepairTrack/issues/6) | Done / closed; reused |
| RT-15 | [#7](https://github.com/HusainKaka/RepairTrack/issues/7) | Done / closed; reused |
| RT-16 | [#8](https://github.com/HusainKaka/RepairTrack/issues/8) | Done / closed; reused |
| RT-17 | [#9](https://github.com/HusainKaka/RepairTrack/issues/9) | Done / closed; live provider setup separate |
| RT-18 | [#10](https://github.com/HusainKaka/RepairTrack/issues/10) | Done / closed; existing release only |
| RT-19 | [#23](https://github.com/HusainKaka/RepairTrack/issues/23) | In progress / open |
| RT-20 | [#24](https://github.com/HusainKaka/RepairTrack/issues/24) | Backlog / open |

## Evidence and status rules

- **Done** means the described artifact/implementation is present, or an existing issue has been verified closed. It is not a security certification or proof that every live integration was tested.
- **In progress** means active implementation or release verification remains. **Backlog** means additional work, external setup or acceptance evidence is still required.
- A checked acceptance item below means the corresponding repository evidence was observed. Test file references establish that tests exist; they do not silently substitute for a recorded test run.
- Preserve existing closed upgrade issues **#5–#10** and reuse their cards. In particular, closing #9 records implemented notification support, not confirmed live WhatsApp delivery.
- Existing classroom PHP reports/backlogs and older setup/testing documents are historical references. Do not copy their old completion claims, Google sign-in instructions or test counts into current release evidence. The reviewed checkout contains backend/web code, not an Android source directory.

## Lifecycle card manifest

### RT-01 · Establish project problem, objectives and scope

Phase: Discovery · Status: **Done — proposal artifacts present; retrospective issue #11 closed**. No original start date is implied.

Evidence: `docs/APT3065_ConceptPaper_Husain_Zohair_Kaka_666724.docx`, `docs/RepairTrack_Week13_Final_Project_Report.docx`, `README.md`.

- [x] Project concept and final-report artifacts exist.
- [x] Current README identifies repair-business scope, actors and supported modules.

### RT-02 · Document system architecture and database design

Phase: Design · Status: **Done — design artifacts present**.

Evidence: `docs/APT3065_RepairTrack_System_Design_Lesson5_Husain_Zohair_Kaka_666724.docx`, `docs/architecture.md`, `docs/database.md`, `backend/prisma/schema.prisma`.

- [x] Design artifacts describe component/data relationships.
- [x] Current Prisma schema defines tenant ownership, workflow and billing relationships.

### RT-03 · Set up repository, application scaffolding and migrations

Phase: Foundations · Status: **Done — setup implementation present**.

Evidence: `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `backend/src/app.ts`, `backend/prisma/migrations/`, `docs/initial-setup.md`.

- [x] Backend/web workspace, build scripts and configuration examples exist.
- [x] Versioned migrations and one-time initial-admin setup are provided; no default accounts are required.

### RT-04 · Implement business onboarding, authentication and tenant roles

Phase: Foundations · Status: **Done — core implementation present**.

Evidence: `backend/src/modules/businesses/business.routes.ts`, `backend/src/modules/auth/`, `backend/src/middleware/authenticate.ts`, `backend/src/middleware/authorize.ts`, `backend/tests/api-security.test.ts`, `web/src/components/RouteGuards.tsx`.

- [x] Business onboarding and administrator invitations are implemented.
- [x] Password/session flows enforce current roles and business context; role/tenant test definitions exist.

### RT-05 · Manage customers, devices and service history

Phase: Core repair build · Status: **Done — implementation present**.

Evidence: `backend/src/modules/customers/customer.routes.ts`, `backend/src/modules/devices/device.routes.ts`, `web/src/pages/DirectoryPages.tsx`, `web/src/pages/AccountPages.tsx`.

- [x] Customer/device create, list, detail and update interfaces exist.
- [x] Records and linked history are tenant scoped; deactivation preserves linked financial/history records.

### RT-06 · Register repair intake and generate unique tickets

Phase: Core repair build · Status: **Done — implementation present**.

Evidence: `backend/src/modules/repairs/repair.routes.ts`, `backend/src/lib/identifiers.ts`, `web/src/pages/RepairPages.tsx`.

- [x] Intake supports existing records or transactionally creates a new customer/device.
- [x] Repair references and private tracking tokens are generated separately from database identifiers.

### RT-07 · Assign technicians and manage repair workflow/notes

Phase: Core repair build · Status: **Done — implementation present**.

Evidence: `backend/src/modules/repairs/repair.routes.ts`, `backend/src/modules/businesses/business.routes.ts`, `backend/tests/repair-workflow.test.ts`, `web/src/pages/RepairPages.tsx`.

- [x] Assignment, priority, controlled status transitions and history are implemented.
- [x] Internal/customer-visible notes and technician access restrictions exist; transition tests are defined.

### RT-08 · Provide private customer tracking and estimate decisions

Phase: Customer experience · Status: **Done — implementation present**.

Evidence: `backend/src/modules/repairs/repair.routes.ts`, `backend/src/lib/customer-view.ts`, `backend/src/lib/crypto.ts`, `web/src/pages/AccountPages.tsx`, `backend/tests/api-security.test.ts`.

- [x] Public tracking returns a customer-safe view through a private token.
- [x] Versioned estimate decisions are recorded with duplicate/stale-response protection and audit history.

### RT-09 · Implement inventory, suppliers and stock movement

Phase: Business operations · Status: **Done — implementation present**.

Evidence: `backend/src/modules/inventory/inventory.routes.ts`, `backend/src/modules/invoices/invoice.routes.ts`, `backend/prisma/schema.prisma`, `web/src/pages/DirectoryPages.tsx`.

- [x] Inventory/supplier records and stock transaction history are implemented.
- [x] Repair/invoice stock changes use tenant checks and transactional accounting; negative stock is rejected.

### RT-10 · Implement repair invoices, payments, receipts and PDFs

Phase: Business operations · Status: **Done — core implementation present**. Digital manual billing is separately reused under #6.

Evidence: `backend/src/modules/invoices/`, `backend/src/lib/pdf.ts`, `backend/tests/invoice-calculation.test.ts`, `backend/tests/payment-provider.test.ts`, `web/src/pages/BillingPages.tsx`.

- [x] Invoice lines, labour, discounts, issue/void rules and balances are implemented.
- [x] Partial payments and invoice/58mm/80mm/A4 receipt output exist. Manual M-Pesa recording requires a verified transaction reference; this is not live payment collection.

### RT-11 · Add notifications, audit, reporting, expenses and subscription controls

Phase: Business operations · Status: **Done — internal modules present; live integrations excluded**.

Evidence: `backend/src/modules/notifications/`, `backend/src/lib/audit.ts`, `backend/src/modules/reports/`, `backend/src/modules/expenses/expense.routes.ts`, `backend/src/modules/subscriptions/`, `web/src/pages/ExpensePages.tsx`, `web/src/pages/SubscriptionPages.tsx`.

- [x] Notification read/unread handling and append-only operational audit events are implemented.
- [x] Expenses, CSV reports and cash-basis profit calculations exist.
- [x] Plans, trials, administrator controls and signed subscription-event handling exist. Hosted checkout deliberately returns `CHECKOUT_ADAPTER_REQUIRED`; its completion belongs in Backlog, not Done.

### RT-12 · Apply Husaini branding, light glass visuals and responsive layouts

Phase: Interface refinement · Status: **Done — web styling implementation present**.

Evidence: `web/src/components/BrandLogo.tsx`, `web/src/components/BrandBackdrop.tsx`, `web/src/styles.css`, `web/src/theme.ts`, `web/src/pages/DashboardPage.tsx`; commits `7050c60`, `3d607f3`, `18fc5b6`, `2cf462f`.

- [x] Full brand asset, RepairTrack identity and light AURA-style background/glass surfaces are implemented.
- [x] Responsive layout rules and overview spacing changes exist. A formal keyboard/screen-reader accessibility audit is not claimed completed.

### RT-13 · Add website, software and AI-agent service tickets

Phase: Digital-services upgrade · Status: **Done — reuse closed [#5](https://github.com/HusainKaka/RepairTrack/issues/5)**.

Existing title: **Add website, software and AI-agent service tickets**.

Evidence: `backend/src/modules/digital-services/`, `backend/prisma/migrations/20261014150000_digital_services/migration.sql`, `web/src/pages/DigitalServicePages.tsx`, `backend/tests/digital-services.test.ts`.

- [x] Distinct website/software/AI-agent references, workflows, assignment and private tracking are implemented without dummy devices.
- [x] Customer/staff visibility and transition tests are defined. AI-agent tickets are service requests, not autonomous execution agents.

### RT-14 · Keep digital-service invoicing explicitly manual

Phase: Digital-services upgrade · Status: **Done — reuse closed [#6](https://github.com/HusainKaka/RepairTrack/issues/6)**.

Existing title: **Add manual invoices for digital-service projects**.

Evidence: `backend/src/modules/invoices/invoice.service.ts`, `backend/src/modules/invoices/invoice.routes.ts`, `web/src/components/InvoiceManagementPanel.tsx`, `web/src/pages/BillingPages.test.tsx`.

- [x] Administrators enter digital service/custom lines and prices explicitly.
- [x] Digital invoices are linked to the appropriate customer/ticket and exclude automatic repair labour/inventory deductions.

### RT-15 · Replace remote logo entry with validated uploads

Phase: Digital-services upgrade · Status: **Done — reuse closed [#7](https://github.com/HusainKaka/RepairTrack/issues/7)**.

Existing title: **Replace logo URLs with validated image uploads**.

Evidence: `backend/src/lib/business-logo.ts`, `backend/src/modules/businesses/business.routes.ts`, `backend/src/lib/pdf.ts`, `backend/src/modules/notifications/email-templates.ts`, `backend/tests/branding-security.test.ts`, `backend/tests/document-branding.test.ts`.

- [x] Administrator upload checks MIME/magic, byte/pixel limits and normalizes supported pictures to PNG in tenant-scoped durable storage.
- [x] Billing PDFs and inline email attachments use uploaded image bytes without arbitrary remote fetching; focused tests exist.

### RT-16 · Remove Google sign-in and make KRA billing optional

Phase: Digital-services upgrade · Status: **Done — reuse closed [#8](https://github.com/HusainKaka/RepairTrack/issues/8)**.

Existing title: **Remove Google sign-in and gate KRA billing content**.

Evidence: `web/src/pages/LoginPage.tsx`, `web/src/pages/LoginPage.test.tsx`, `backend/src/modules/settings/setting.routes.ts`, `backend/src/lib/pdf.ts`, `web/src/pages/BillingPages.tsx`, `docs/digital-services.md`.

- [x] Web login no longer shows the Google widget/configuration banner; meaningful password-login errors remain.
- [x] Administrator KRA toggle defaults off, gates billing content and requires configured setup before enabling. Existing accounting values are retained.

### RT-17 · Implement consent-aware automatic WhatsApp ticket notices

Phase: Digital-services upgrade · Status: **Done — code complete; reuse closed [#9](https://github.com/HusainKaka/RepairTrack/issues/9)**.

Existing title: **Send consent-aware WhatsApp ticket and tracking notices**.

Evidence: `backend/src/modules/notifications/whatsapp-provider.ts`, `backend/src/modules/notifications/notification.service.ts`, `backend/src/modules/customers/whatsapp-consent.ts`, `backend/tests/ticket-notifications-security.test.ts`, `backend/tests/whatsapp-consent.test.ts`.

- [x] All four intake categories can send a ticket number/private link after explicit consent; recipient changes clear consent.
- [x] Provider configuration, approved template, tenant-scoped retries and pending/failed/sent distinctions are implemented.
- [x] Live-provider prerequisites remain separately open under RT-20; do not reopen #9 or claim handset delivery without evidence.

### RT-18 · Harden security, regression checks, migrations and Vercel release

Phase: Verification and release · Status: **Done for the existing upgrade — reuse closed [#10](https://github.com/HusainKaka/RepairTrack/issues/10)**.

Existing title: **Verify upgrade security, migration and Vercel release**.

Evidence: `.github/workflows/security.yml`, `backend/tests/api-security.test.ts`, `backend/tests/auth-remediation.test.ts`, `backend/tests/security-remediation.test.ts`, `backend/tests/digital-migration.test.ts`, `backend/scripts/vercel-release.mjs`, `backend/tests/vercel-release.test.ts`, `web/vercel.json`, `docs/deployment.md`; commits `9a7ae59`, `d85438b`, `80eaa84`.

- [x] Tenant/session/data-export hardening and security regression test definitions are present; CI performs validation/build/audit commands.
- [x] Additive digital migration and guarded production release workflow exist; the existing release issue is closed.
- [x] Any new manual-sharing release must be verified separately against its actual commit and both Vercel projects; #10's closure does not establish that a future release is deployed or that vulnerabilities cannot exist.

### RT-19 · Add manual WhatsApp sharing for tracking and invoices

Phase: Current enhancement · Status: **In progress — open [#23](https://github.com/HusainKaka/RepairTrack/issues/23)**; not a duplicate of provider-automation #9.

Evidence: `whatsapp-sharing.md` documents current scope/ownership/security gates. Implementation is active; this retrospective does not claim completion.

- [ ] Add click-to-chat drafts containing repair/digital ticket numbers and tracking links, preserving the selected customer contact.
- [ ] Add authorized, private, expiring invoice share links; cover access/expiry and URL/phone validation with tests.
- [ ] Verify the new release in both Vercel projects. A button click must never be recorded as automatic delivery; the operator still presses Send in WhatsApp.

### RT-20 · Complete optional live integrations and operational acceptance

Phase: Operations / future acceptance · Status: **Backlog — open [#24](https://github.com/HusainKaka/RepairTrack/issues/24)**; separate from closed #9/#10.

Evidence: `docs/digital-services.md`, `docs/deployment.md`, `docs/testing.md`, `docs/privacy-retention.md`, `backend/src/modules/subscriptions/subscription.routes.ts`, `README.md` production warning.

- [ ] Configure the optional WhatsApp provider/approved five-parameter template and record sandbox recipient-consent/delivery results without exposing secrets.
- [ ] Complete KRA setup and sandbox validation before deliberately enabling it; leave it off until then.
- [ ] Complete the hosted subscription checkout adapter and verified sandbox payment flow before collecting online subscription payments.
- [ ] Record backup/restore, monitoring, mail-domain and privacy-retention acceptance evidence; perform real keyboard/screen-reader/responsive checks. Absence of evidence here is not proof that external infrastructure is unconfigured.

## Updating the existing board

The board reuses #5–#10 with their closed states, adds retrospective core-phase issues #11–#22, and separately tracks manual sharing in #23 and operations/provider acceptance in #24. New retrospective records carry the retrospective marker, observed evidence paths and acceptance checklists rather than invented historical activity.

Keep phase order as a planning aid, not a fabricated historical timeline. Move RT-19 to Done only after implementation tests and the matching deployment commit are verified. Move RT-20 acceptance items only when real provider/operational evidence is available; never infer successful live delivery from code, configuration detection, an issue closure or a button click.
