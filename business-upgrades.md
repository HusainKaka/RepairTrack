# Business upgrades and production hardening

This release extends RepairTrack without replacing its existing authentication, tenancy, repair, inventory, billing, reporting, and audit architecture.

## Delivered workflows

- Draft invoices can be edited before payment or confirmed eTIMS submission. Administrators can change invoice metadata, add/edit/remove custom, service, labour, and inventory lines, and apply line or invoice discounts.
- Repair-linked invoices receive the business's configurable default labour line (`KES 1,500` for existing/default configurations). Inventory lines preserve the selling price and historical unit cost used for financial reporting.
- Issuing an invoice deducts linked stock transactionally. Safe voiding returns eligible invoice-deducted stock. Paid and confirmed eTIMS invoices are protected from destructive deletion.
- Customers, devices, and repairs use reason-required deactivation/archival. Historical invoices, payments, repairs, and audit evidence are retained.
- Repair intake can select existing records or create a new customer and device in the same database transaction. Customer type, KRA PIN, WhatsApp number, and preferred channel are supported.
- Public tracking tokens remain hashed for lookup and are encrypted with authenticated AES-256-GCM only where a future terminal notification needs the original private link. Customers can accept or decline a versioned estimate once; the decision is time-stamped, audited, and shown to staff.
- Repair email policy intentionally sends an intake email and one terminal email. WhatsApp is isolated behind a provider adapter and records no false success when credentials or recipient data are missing.
- The in-app notification centre supports categories, unread filters, counts, related repair/customer context, individual read, and mark-all-read.
- Business costs and utilities support create/edit/void, period filters, recurring markers, HTTPS attachments, monthly trends, and CSV export.
- Profit reports use a clearly labelled cash-basis formula: payments received minus allocated historical part cost and active operating expenses.
- Business administrators may opt in as repair assignees without receiving technician-only permissions.
- KRA/eTIMS and subscription payments use strict adapter boundaries. No invoice or subscription is marked confirmed/paid without a valid external response or signed, idempotent webhook.

## Database migration

Migration: `backend/prisma/migrations/20260817170000_business_upgrades/migration.sql`

The migration is additive: it introduces new enums, columns, tables, indexes, and foreign keys; seeds three subscription plans; and gives existing businesses a starter subscription. Existing repair, invoice, inventory, and audit rows are retained.

Production release sequence:

1. Put the application into a maintenance window if write volume is high.
2. Take a managed PostgreSQL backup or restore point and confirm its timestamp.
3. Export the current Vercel environment variables to a secure private record.
4. Run `pnpm install --frozen-lockfile` and `pnpm --filter=@repairtrack/backend prisma:generate` from a trusted release machine.
5. Set `DATABASE_URL` to the production **direct/non-pooled** migration URL for that terminal session.
6. Run `pnpm --filter=@repairtrack/backend prisma:migrate` exactly once.
7. Confirm `pnpm --filter=@repairtrack/backend prisma:validate` and visit `/health` and `/ready` on the API.
8. Deploy/redeploy the backend, then the web project, and complete the manual checklist below.

Do not run `prisma migrate dev` against production. If the migration fails, stop application writes, preserve the full error, restore the backup when necessary, and correct the migration through a reviewed forward migration.

## External credentials still required

Core repair, invoice, expense, notification-centre, and reporting workflows work without external provider credentials. The following live integrations remain disabled until their real provider configuration is supplied:

- SMTP email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- Meta WhatsApp Cloud API: `WHATSAPP_API_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_SECRET`
- KRA/eTIMS: `KRA_ETIMS_ENVIRONMENT`, `KRA_ETIMS_BASE_URL`, `KRA_ETIMS_CLIENT_ID`, `KRA_ETIMS_CLIENT_SECRET`, `KRA_ETIMS_SUBMIT_PATH`
- Subscription gateway: `PAYMENT_GATEWAY_PROVIDER`, `PAYMENT_GATEWAY_WEBHOOK_SECRET` plus provider-specific checkout credentials
- Google login: backend `GOOGLE_WEB_CLIENT_ID` and web `VITE_GOOGLE_CLIENT_ID` must use the same OAuth web client ID

Provider secrets belong only in Vercel's encrypted Environment Variables; never upload `.env` files to GitHub.

## Manual verification checklist

- [ ] Log in as Super Admin, Business Admin, Technician, and Customer; confirm each role sees only permitted navigation and data.
- [ ] Create a repair using a new customer and new device; copy the private tracking link and verify public tracking excludes internal notes.
- [ ] Move the repair to approval required; accept and separately test decline using different repairs; confirm duplicate responses are rejected.
- [ ] Create a repair invoice and confirm the configured labour line is added automatically.
- [ ] Add an inventory invoice line, edit its discount/tax/quantity, issue it, and confirm stock is reduced exactly once.
- [ ] Delete a draft invoice; void an eligible issued invoice; confirm paid/eTIMS-confirmed deletion is rejected.
- [ ] Record a payment and download an invoice and receipt; verify logo, KRA PIN, totals, discounts, items, status, and reference.
- [ ] Add and edit costs/utilities, export CSV, and compare the profit report totals with the period inputs.
- [ ] Verify unread notification count, category filter, mark-read, and mark-all-read.
- [ ] Opt the current administrator into technician work and assign a repair to that administrator.
- [ ] Confirm unconfigured WhatsApp, KRA, and subscription checkout return honest configuration errors rather than success.
- [ ] Attempt cross-business identifiers with a second tenant and confirm they return not found/forbidden without leaking data.
