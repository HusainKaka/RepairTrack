# Security design

## Controls implemented

- Argon2id password hashing and a configurable minimum password policy.
- Fifteen-minute JWT access tokens and rotating, revocable refresh sessions.
- Hashed, expiring email verification, password reset, public tracking, and setup tokens.
- Role and capability checks in API middleware plus service-level tenant filters.
- UUID primary keys and non-sequential public repair tokens.
- Zod request validation, Helmet, strict CORS allowlisting, JSON size limits, and rate limits.
- Prisma parameterized access; raw SQL is not used for user-provided values.
- Append-only audit records with IP, request ID, user agent, action, and safe metadata.
- No tokens in web `localStorage`; access state is held in memory and refresh tokens use HttpOnly cookies.
- Android tokens are protected with Android Keystore-backed encrypted preferences.

## Operational requirements

- Terminate TLS at the load balancer and set `TRUST_PROXY=1` only behind a trusted proxy.
- Use separate least-privilege database roles for migrations and runtime traffic.
- Keep `JWT_SECRET`, database credentials, OAuth credentials, SMTP credentials, Firebase credentials, and signing keys in a secret manager.
- Redact passwords, access/refresh tokens, device credentials, card data, and personal data from logs.
- Back up PostgreSQL with encrypted, tested point-in-time recovery.
- Configure retention and deletion schedules consistent with the Kenya Data Protection Act, 2019.

## Deliberate constraints

Device passcodes are not accepted by the default API. A future passcode-vault feature must use envelope encryption with a managed KMS, explicit consent, per-access audit, automatic expiry, and sharply restricted roles.

M-Pesa, SMTP, Firebase Cloud Messaging, and Google Sign-In use provider adapters. They do not simulate successful external delivery or payment confirmation when credentials are absent.

