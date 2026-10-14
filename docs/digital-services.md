# Digital solutions

RepairTrack supports website, software and AI-agent **service tickets** alongside existing hardware repairs. It does not execute autonomous AI agents.

## Intake and workflow

Business admins open **Digital solutions → New digital intake**, select an existing customer or enter a new one, choose the service category and record the project title, requirements, priority, assignee and expected completion date. References use `WEB`, `SW` or `AI` prefixes. Digital tickets do not create dummy devices or consume repair inventory.

Workflow: Intake → Discovery → Awaiting approval → In progress → Testing → Ready for delivery → Delivered. Controlled transitions permit clarification/rework and cancellation. Staff record customer-visible progress separately from internal notes. Technicians only access assigned tickets; customers only access their own. Private bearer tracking links expose a minimal customer-safe timeline, never internal notes, requirements, staff authentication data or token storage.

Approvals in this release are recorded by staff after confirming the customer decision. There is no automatic public digital-quote acceptance endpoint.

## Manual invoices and branding

Use **Create manual invoice** from a digital ticket. Enter service/custom descriptions, quantities and prices explicitly. Repair labour charges, inventory lines and automatic parts deductions are excluded. Existing payment and receipt workflows remain available.

Business admins upload a logo in **Settings → Business profile**. PNG, JPEG, WebP, GIF, AVIF and TIFF are accepted within 2 MB and 4096×4096 pixels; animation/multiple pages and metadata are stripped and images are normalized to PNG. SVG is rejected. Storage is tenant-scoped and durable; PDFs and email CID attachments use the uploaded image without remote URL fetching.

KRA/eTIMS is off by default. **Settings → KRA / eTIMS controls** hides KRA fields/status/references on invoices and receipts until setup is completed and the admin enables it. Existing tax calculations and accounting records are retained.

## WhatsApp setup

Record the customer's explicit WhatsApp permission in their profile or new-customer intake; selecting WhatsApp as a preference alone is not consent. Changing the recipient clears consent. Consented customers receive an automatic intake ticket reference and private tracking link for repairs and all digital categories, even when email is their preferred ongoing channel. Ongoing WhatsApp status updates follow their channel preference.

Configure `WHATSAPP_API_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TICKET_TEMPLATE_NAME` and `WHATSAPP_TICKET_TEMPLATE_LANGUAGE` in the API's protected environment. The approved utility template must have five body variables in order: customer name, ticket reference, service type, status, full tracking URL. Example body:

> Hello {{1}}, your {{3}} ticket {{2}} is {{4}}. Track your request: {{5}}

Obtain Meta approval for the actual template and customer opt-in before sending. Do not paste credentials into GitHub or chat. Missing configuration stays pending; failures are recorded; provider acceptance is required for Sent status. Sent indicates provider acceptance, not confirmed handset delivery.

Admins can inspect recent delivery attempts and retry WhatsApp under Notifications. Retries recheck tenant, customer consent and active ticket/account status. An interrupted attempt with an unknown provider outcome must be reconciled before unlocking/retrying, to avoid duplicate messages.

## Project tracking

[GitHub kanban board](https://github.com/users/HusainKaka/projects/6) tracks issues [#5](https://github.com/HusainKaka/RepairTrack/issues/5)–[#10](https://github.com/HusainKaka/RepairTrack/issues/10). WhatsApp live-provider setup remains an external prerequisite. Security tests and dependency scans reduce risk but are not a guarantee of vulnerability-free operation.
