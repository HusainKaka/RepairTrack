# RepairTrack

RepairTrack is a production-style, multi-tenant repair-management platform for electronics and ICT service businesses. One Express/PostgreSQL backend serves a responsive React web application and a native Kotlin Android application.

The system covers business onboarding, customers, devices, repair workflows, technician assignment, inventory, invoices, partial payments, PDF invoices/receipts, secure QR tracking, notifications, reports, audit logs, and four roles: `SUPER_ADMIN`, `BUSINESS_ADMIN`, `TECHNICIAN`, and `CUSTOMER`.

## Repository layout

```text
RepairTrack/
  backend/   Express, TypeScript, Prisma, PostgreSQL, tests, migrations
  web/       React 19, Vite, Material UI, TanStack Query, tests
  android/   Kotlin, Compose, Hilt, Retrofit, Room, WorkManager, FCM
  docs/      Architecture, API, database, security, setup, manuals
```

The previous classroom PHP prototype is preserved locally in the ignored `legacy-php/` directory. It is not part of the production application and is excluded because it contains demo-only behavior.

## Architecture and security

- Short-lived JWT access tokens; rotating opaque refresh tokens stored only as SHA-256 digests.
- Argon2id passwords, expiring hashed reset/verification tokens, rate limits, Zod validation, Helmet, strict CORS, and safe error envelopes.
- Every tenant record is scoped by `businessId`; API handlers enforce role, tenant, and object ownership.
- Web access tokens stay in memory and refresh cookies are `HttpOnly`; nothing sensitive is placed in `localStorage`.
- Android sessions use AES-GCM keys held by Android Keystore. Room caches operational data and WorkManager syncs safe offline repair updates; payments remain online-only.
- Repair QR codes contain random public tokens, never database IDs. Public tracking omits internal notes and staff/security data.
- Payment, stock, sequence, receipt, and assignment changes use database transactions and append audit records.

See [architecture](docs/architecture.md), [security](docs/security.md), and [database design](docs/database.md).

## Requirements

- Node.js 20.19 or newer; Node 22 LTS is recommended
- pnpm 10.x (`corepack enable` then `corepack prepare pnpm@10.15.1 --activate`)
- PostgreSQL 15+ or Docker Desktop
- Android Studio with JDK 17, Android SDK 36, and platform tools
- Git

External credentials are optional for local core workflows. Google Sign-In, SMTP delivery, Firebase push, and live M-Pesa require provider configuration and never report fake success when unconfigured.

## Local quick start

1. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Create local environment files:

   ```bash
   cp backend/.env.example backend/.env
   cp web/.env.example web/.env
   ```

   On PowerShell, use `Copy-Item backend/.env.example backend/.env` and the equivalent web command. Replace `CHANGE_ME` and generate a JWT secret of at least 32 random characters.

3. Start PostgreSQL with Docker:

   ```bash
   POSTGRES_PASSWORD='a-strong-local-password' docker compose up -d postgres
   ```

   On PowerShell:

   ```powershell
   $env:POSTGRES_PASSWORD = 'a-strong-local-password'
   docker compose up -d postgres
   ```

   Set the same password in `backend/.env` `DATABASE_URL`.

4. Generate the client and apply the versioned migration:

   ```bash
   pnpm --filter @repairtrack/backend prisma:generate
   pnpm --filter @repairtrack/backend prisma:migrate
   ```

5. Create the one and only initial super administrator in an interactive terminal:

   ```bash
   pnpm --filter @repairtrack/backend setup:admin -- --email owner@example.com --name "Platform Owner"
   ```

   The password is entered without echo and never appears in shell history. A serializable database setup lock prevents the command from running twice. There are no seeded users or default passwords.

6. Start the API and web client:

   ```bash
   pnpm dev
   ```

   Web: `http://localhost:5173`

   API health: `http://localhost:4000/health`
   Database readiness: `http://localhost:4000/ready`

Detailed instructions: [backend/first setup](docs/initial-setup.md), [web setup](docs/web-setup.md), and [Android setup](docs/android-setup.md).

## Environment configuration

Backend required values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the runtime role |
| `JWT_SECRET` | Random signing secret, minimum 32 characters |
| `WEB_ORIGIN` | Exact browser origin accepted by CORS |
| `PUBLIC_WEB_URL` | Public links used in mail and QR output |
| `TRUST_PROXY` | `0` locally; set only for the known reverse-proxy depth |

Optional integrations use `GOOGLE_WEB_CLIENT_ID`, `SMTP_*`, `FCM_*`, and `MPESA_*`. All keys are described in `backend/.env.example` and [deployment](docs/deployment.md). Web compile-time values are `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`.

## Android application

Open `android/` as the Android Studio project. Create `android/local.properties` with the SDK path and local settings:

```properties
sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk
repairtrack.apiUrl=http://10.0.2.2:4000/api/v1/
repairtrack.googleWebClientId=
repairtrack.firebaseApplicationId=
repairtrack.firebaseApiKey=
repairtrack.firebaseProjectId=
repairtrack.firebaseSenderId=
```

Build from `android/`:

```bash
./gradlew clean assembleDebug testDebugUnitTest lintDebug
```

On Windows use `gradlew.bat`. The debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`. See [Android setup](docs/android-setup.md) for Google OAuth, Firebase, notification permission, emulator/network, QR scanning, offline sync, signing, and Bluetooth/Wi-Fi ESC/POS printing.

## Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @repairtrack/backend prisma:validate
cd android && ./gradlew clean assembleDebug testDebugUnitTest lintDebug
```

The checked project passes backend/web lint and type checks, 18 backend tests, 5 web tests, 8 Android JVM tests, backend/web production builds, Prisma schema and generated migration validation, Android APK assembly, and Android lint with no app issues. Connected Compose UI tests require an emulator/device. A live fresh PostgreSQL migration requires PostgreSQL or Docker; this machine had neither, so the committed 26-table/56-foreign-key migration was validated against Prisma-generated SQL but not applied to a local server. See [testing](docs/testing.md).

## Documentation

- [Architecture](docs/architecture.md) · [API](docs/api.md) · [Database/ERD](docs/database.md)
- [Security](docs/security.md) · [Privacy and retention](docs/privacy-retention.md)
- [Initial admin](docs/initial-setup.md) · [Web](docs/web-setup.md) · [Android](docs/android-setup.md)
- [Google Sign-In](docs/google-sign-in.md) · [M-Pesa readiness](docs/mpesa-integration.md)
- [Testing](docs/testing.md) · [Deployment](docs/deployment.md) · [Troubleshooting](docs/troubleshooting.md)
- [User manual](docs/user-manual.md) · [Administrator](docs/administrator-manual.md) · [Technician](docs/technician-manual.md) · [Customer](docs/customer-manual.md)
- [Developer guide](docs/developer-guide.md)

## Production warning

Before handling real customer data, configure managed PostgreSQL backups, HTTPS, provider credentials, a secret manager, production signing, retention/deletion policies, mail domain authentication, and monitoring. Complete provider and device tests in the target environment; no external provider was falsely marked tested without credentials.
