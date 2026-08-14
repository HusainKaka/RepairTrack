# Testing and verification

## Automated commands

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @repairtrack/backend prisma:validate
```

From `android/`:

```bash
./gradlew clean assembleDebug testDebugUnitTest lintDebug
```

With an emulator/device:

```bash
./gradlew connectedDebugAndroidTest
```

## Current checked result

| Area | Result |
|---|---|
| Backend ESLint and TypeScript | Pass, zero errors/warnings |
| Backend Vitest | 6 files, 18 tests passed |
| Backend build | Pass |
| Web ESLint and TypeScript | Pass, zero errors/warnings |
| Web Vitest | 3 files, 5 tests passed |
| Web production build | Pass; largest emitted chunk about 347 KB before gzip |
| Prisma schema/client | Generate and validate pass |
| Migration structural validation | Prisma SQL and committed migration both contain 26 tables and 56 foreign keys |
| Android clean build | Pass; debug APK generated |
| Android JVM tests | 5 suites, 8 tests passed |
| Android lint | Pass, no app issues |
| Connected Compose UI test | Authored; not run because no emulator/device was available |
| Live fresh PostgreSQL deploy | Not run on this machine because Docker/PostgreSQL was unavailable |
| Google/SMTP/FCM/M-Pesa live tests | Not run because provider credentials were not supplied |

## Coverage focus

Backend tests exercise Argon2/session cryptography, safe account-state transitions, invoice calculations, manual payment evidence rules, allowed repair transitions, standardized API errors, unauthenticated access, invalid JWT, validation, XSS-shaped input, and rate/security headers. Web tests cover the API retry contract and reusable data/status components. Android tests cover API serialization, authentication ViewModel state, tracking-token parsing, navigation routes, and ESC/POS content/width.

The Compose onboarding instrumentation test lives in `android/app/src/androidTest` and requires a running Android test target.

## Manual release checklist

1. Apply migrations to a fresh database, then re-run deploy to confirm idempotency.
2. Create the first admin once and confirm a second attempt is rejected.
3. Create two businesses and prove IDs from one tenant return `404`/`403` to the other.
4. Exercise customer signup, verification, password reset, login, refresh rotation, logout, and Google sign-in.
5. Create customer/device/repair, assign technician, traverse every valid status, and reject invalid transitions.
6. Add stock/parts, confirm stock history and negative-stock rules.
7. Create/issue invoice, record partial and final payments, download invoice/receipt PDFs, and confirm overpayment is rejected.
8. Scan a QR token logged out and confirm only customer-safe fields appear.
9. Test SMTP and FCM with sandbox accounts; inspect failure/pending states when disabled.
10. Print 58mm and 80mm receipts over Bluetooth and TCP port 9100 on representative hardware.
11. Install a signed release build, test offline queue recovery/conflict behavior, and confirm payments require network.
12. Run dependency, secret, and container scans in CI before deployment.

## Security test ideas for CI

Add database-backed integration fixtures for cross-tenant IDOR, expired tokens, concurrent refresh, brute-force limits, SQL/XSS payload persistence, concurrent document numbering, stock races, and duplicate payment idempotency. Run these only against an isolated disposable database.
