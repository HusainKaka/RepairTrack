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
| Backend Vitest | 7 files, 25 tests passed |
| Backend build | Pass |
| Web ESLint and TypeScript | Pass, zero errors/warnings |
| Web Vitest | 3 files, 5 tests passed |
| Web production build | Pass; 1,102 modules, largest emitted chunk about 348 KB before gzip |
| Prisma schema/client | Generate and validate pass |
| Upgrade migration | Additive migration authored and schema validated; production deploy requires target database credentials and a backup |
| Android Kotlin compile | Pass after the shared API contract upgrade |
| Android JVM tests/lint | Rerun was blocked by a Windows/OneDrive lock in generated `android/app/build` output; no Kotlin compile error occurred |
| Connected Compose UI test | Authored; not run because no emulator/device was available |
| Live fresh PostgreSQL deploy | Not run on this machine because Docker/PostgreSQL was unavailable |
| Google/SMTP/FCM/M-Pesa/WhatsApp/KRA live tests | Not run because provider credentials were not supplied |

## Coverage focus

Backend tests exercise Argon2/session cryptography, encrypted tracking tokens, safe account-state transitions, invoice calculations and edit/delete policy, default labour, exact repair email milestones, tenant scoping, cash-basis profit, subscription verification, manual payment evidence, repair transitions, standardized API errors, and authentication/authorization boundaries. Web tests cover the API retry contract and reusable data/status components. Existing Android tests cover API serialization, authentication state, tracking-token parsing, navigation routes, and ESC/POS content/width.

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
