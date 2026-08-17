# RepairTrack architecture

## System context

RepairTrack uses a single backend and PostgreSQL database for both the React web client and the native Android client. All tenant-owned records carry a non-null `businessId`; request handlers obtain the authenticated principal from the verified access token and enforce tenant and object-level authorization before accessing data.

```text
Browser (React) -----------\
                            > HTTPS REST API (Express) -> Prisma -> PostgreSQL
Android (Compose/Retrofit)-/                  |             |
                                              |             +-> immutable audit records
                                              +-> SMTP/FCM provider adapters
                                              +-> PDF and QR generation
```

## Backend boundaries

- `config`: validated runtime configuration; startup fails closed when required secrets are absent.
- `middleware`: authentication, RBAC, tenant context, validation, request IDs, rate limits, and safe errors.
- `modules`: route/controller/service boundaries for authentication, businesses, customers, devices, repairs, inventory, invoices, payments, receipts, notifications, and reports.
- `lib`: Prisma, cryptography, identifiers, audit, mail, QR, and document helpers.
- `prisma`: normalized schema and versioned SQL migrations.

Transactions protect multi-record invariants such as stock consumption, repair-part creation, payment application, receipt numbering, and invoice balance updates.

## Identity and session flow

1. The user proves identity using a verified password or a Google ID token.
2. The API issues a short-lived signed access token and an opaque refresh token.
3. Only a SHA-256 digest of the refresh token is stored in `sessions`.
4. Refresh rotates the token and invalidates the previous digest in one transaction.
5. Logout revokes the current session; password reset and account disable revoke all sessions.

## Deployment topology

The web application is a static Vite build served from a CDN. The backend runs as a stateless HTTPS service behind a reverse proxy. PostgreSQL, object storage, SMTP, Firebase, and secrets are managed services in production. Horizontal API replicas share only PostgreSQL and provider services.

