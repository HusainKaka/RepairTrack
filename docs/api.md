# REST API reference

Base URL: `http://localhost:4000/api/v1` locally. Production traffic must use HTTPS.

Authenticated calls use `Authorization: Bearer <access-token>`. The browser refresh token is an `HttpOnly`, `SameSite=Lax` cookie scoped to `/api/v1/auth`; Android stores the cookie value encrypted by Android Keystore. Access tokens expire after 15 minutes by default and refresh rotates the session token.

## Response contract

Success:

```json
{ "success": true, "data": {} }
```

Failure:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "The request could not be completed.",
  "errors": { "email": ["Invalid email address"] },
  "requestId": "..."
}
```

Expected status codes include `200`, `201`, `202`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, and `500`. Production errors never expose stacks.

## Endpoint catalogue

Role abbreviations: SA = super admin, BA = business admin, T = technician, C = customer, Public = no session.

| Method and path | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Process health; does not prove database connectivity |
| `GET /ready` | Public | PostgreSQL readiness probe |
| `POST /auth/signup` | Public | Create a customer account within a business |
| `POST /auth/login` | Public | Email/password sign-in with credential rate limit |
| `POST /auth/google` | Public | Verify a Google ID token against the configured audience |
| `POST /auth/refresh` | Refresh cookie | Rotate refresh session and issue an access token |
| `POST /auth/logout` | Refresh cookie | Revoke current session and clear cookie |
| `POST /auth/verify-email` | Public | Consume a hashed, expiring verification token |
| `POST /auth/forgot-password` | Public | Send a generic reset response to prevent enumeration |
| `POST /auth/reset-password` | Public | Consume reset token, update Argon2id hash, revoke sessions |
| `GET /auth/me` | Any user | Return current user and role |
| `PATCH /auth/me` | Any user | Update own name, phone, or avatar URL with audit |
| `DELETE /auth/account` | Any user | Start account deletion workflow and revoke access |
| `GET /businesses` | SA | Paginated business listing |
| `POST /businesses` | SA | Create business and primary-admin invitation |
| `PATCH /businesses/:id/status` | SA | Activate, suspend, or soft-delete a business |
| `GET /businesses/profile` | BA, T | Read own tenant profile |
| `PATCH /businesses/profile` | BA | Update own profile, tax, footer, contact, hours |
| `GET /businesses/technicians` | BA | List tenant technicians/workload counts |
| `POST /businesses/technicians` | BA | Create technician and secure password invitation |
| `PATCH /businesses/technicians/:id/status` | BA | Enable/disable a tenant technician |
| `POST /businesses/technicians/:id/password-reset` | BA | Send expiring password reset |
| `GET /businesses/audit` | SA, BA | Read immutable, scoped audit trail |
| `GET/POST /customers` | BA/T read, BA write | Search/list or create customers |
| `GET/PATCH/DELETE /customers/:id` | Scoped | Profile/history read, BA edit/soft-delete |
| `GET/POST /devices` | BA/T read, BA write | Search/list or register customer devices |
| `GET/PATCH /devices/:id` | Scoped | Read or BA update a device |
| `GET /repairs/track/:token` | Public | Privacy-filtered tracking by random token |
| `GET/POST /repairs` | Scoped | List role-visible repairs or BA create ticket |
| `GET/PATCH /repairs/:id` | Scoped | Role-filtered detail or permitted repair edit |
| `POST /repairs/:id/assign` | BA | Reassign technician with assignment history/audit |
| `POST /repairs/:id/accept` | Assigned T | Accept own assigned job |
| `POST /repairs/:id/status` | BA, assigned T | Enforce workflow transition; notify customer |
| `POST /repairs/:id/notes` | BA, assigned T | Add internal or customer-visible note |
| `GET/POST /inventory` | BA/T read, BA write | List/search or create stock item |
| `PATCH /inventory/:id` | BA | Edit non-quantity item fields |
| `POST /inventory/:id/adjust` | BA | Audited stock-in/out; explicit negative override only |
| `GET /inventory/:id/history` | BA, T | Stock transaction history |
| `POST /inventory/repairs/:repairId/parts` | BA, assigned T | Atomically consume stock and attach repair part |
| `GET /inventory/suppliers/list` | BA | List suppliers |
| `POST /inventory/suppliers` | BA | Create supplier |
| `GET/POST /invoices` | BA/C read, BA write | Role-filtered listing or draft creation |
| `GET /invoices/:id` | BA, owning C | Invoice with items, payments, receipts |
| `POST /invoices/:id/issue` | BA | Issue a draft invoice |
| `GET /invoices/:id/pdf` | BA, owning C | Download professional PDF |
| `POST /invoices/:id/email` | BA | Send invoice through configured SMTP |
| `POST /invoices/:id/payments` | BA | Record full/partial payment and create receipt |
| `GET /invoices/receipts/:receiptId/pdf` | BA, owning C | Refresh repair status and render 58mm/80mm/A4 receipt |
| `POST /invoices/:id/cancel` | BA | Cancel unpaid invoice only |
| `GET /notifications` | Any user | Current user notifications |
| `PATCH /notifications/:id/read` | Owning user | Mark notification read |
| `POST/DELETE /notifications/devices` | Any user | Register/revoke FCM app-instance identifier |
| `GET /reports/dashboard` | BA, T | Role-specific operational metrics |
| `GET /reports/platform` | SA | Aggregate tenant/subscription/user/session/activity metrics |
| `GET /reports/repairs.csv` | BA | Export tenant repair data |
| `GET /reports/analytics?from=&to=` | BA | Status/device/technician/invoice/payment/parts analytics |
| `GET /reports/search?q=` | BA | Cross-module tenant search |
| `GET /settings` | SA, BA | Read platform or tenant settings |
| `PUT /settings/:key` | SA, BA | Audited JSON setting update |

## Representative calls

```bash
curl -i http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  --data '{"email":"owner@example.com","password":"your-password"}'
```

```bash
curl http://localhost:4000/api/v1/repairs \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Create a repair:

```json
{
  "customerId": "uuid",
  "deviceId": "uuid",
  "reportedIssue": "Does not power on",
  "assignedTechnicianId": "uuid",
  "estimatedCost": 3500,
  "priority": "NORMAL"
}
```

Record a payment:

```json
{
  "amount": 1500,
  "method": "MPESA",
  "transactionReference": "verified-provider-reference",
  "paperWidth": "80mm"
}
```

Payment recording is an administrator-confirmed ledger operation. It does not pretend that Safaricom confirmed a payment; see [M-Pesa integration](mpesa-integration.md).

## Authorization guarantees

IDs alone never grant access. Queries combine the authenticated `businessId` with role-specific ownership constraints. Technicians are restricted to assigned repairs; customers are restricted to their linked customer record. The tracking endpoint uses only a hashed random token and returns a dedicated privacy-filtered projection.
