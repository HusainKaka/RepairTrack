# Administrator manual

## Super administrator

1. Sign in with the account created by the one-time setup CLI.
2. Open Businesses to review platform tenants, subscription/status, user count, and repair count.
3. Choose Onboard business, enter official business/contact/address/tax defaults, and identify the primary administrator.
4. The administrator receives an expiring password-setup invitation through SMTP.
5. Activate, suspend, or deactivate tenants from the business list. Non-active status revokes tenant sessions.
6. Use Audit and platform Settings for oversight. Super admins do not receive unrestricted repair-detail access by default.

## Business administrator daily workflow

1. Configure Settings: business identity, currency, tax rate, invoice/receipt footer, notifications, and contact data.
2. Create technicians. They set their own password from an expiring link. Disable departed staff immediately.
3. Register or find the customer; avoid duplicates by checking email/phone.
4. Register the device and identify serial/IMEI, accessories, condition, and reported fault. Do not record a device passcode.
5. Create the repair ticket, assign a technician, set priority/estimate, and give the customer the reference/QR tracking link.
6. Monitor workflow, reassign when required, and review status/customer messages.
7. Maintain inventory and suppliers. Quantity changes must use stock adjustment so the history remains complete.
8. Create and issue invoices. Record only verified payments; partial payments update balance and each payment creates a receipt.
9. Download/email PDFs or print 58mm/80mm receipts from Android. The receipt refreshes current repair status.
10. Review dashboard, reports/CSV, low stock, outstanding balances, notifications, and audit trail.

## Controls and cautions

- Every action is scoped to the administrator's business. Report cross-tenant data immediately.
- Technician status updates revoke sessions when disabled.
- Negative stock requires an explicit administrator override and remains audited.
- Paid invoices cannot be cancelled without a proper payment-reversal process.
- M-Pesa entries are manual verified references until Daraja is integrated; never infer confirmation from a customer screenshot alone.
- Audit logs cannot be edited from the application.
