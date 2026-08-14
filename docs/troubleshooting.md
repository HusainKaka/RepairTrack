# Troubleshooting

## API cannot start

- Run `pnpm --filter @repairtrack/backend prisma:validate`.
- Confirm `backend/.env` exists and `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, and URLs are syntactically valid.
- `JWT_SECRET` must be at least 32 characters and must not contain the development placeholder in production.
- Check whether port 4000 is already occupied.

## `/health` works but `/ready` fails

The process is alive but PostgreSQL is unavailable. Check Docker/service status, password, host/port, database name, SSL requirements, firewall, and migration state. From Docker, wait for `docker compose ps` to report healthy before migrating.

## Browser gets CORS or refresh errors

Set backend `WEB_ORIGIN` to the exact web scheme, hostname, and port. Requests must use credentials for refresh cookies. In production both sites should be HTTPS; check proxy cookie rewriting and do not expose the API through multiple unlisted origins.

## Google sign-in unavailable/rejected

Confirm the same Web client ID across backend/web/Android. Check consent-screen test users, Android package/application-ID suffix, SHA-1/SHA-256, device Google Play Services, and production domain/origin. See [Google Sign-In](google-sign-in.md).

## Android cannot reach local API

Use `http://10.0.2.2:4000/api/v1/` in the standard emulator. A physical device cannot use the computer's `localhost`; use a reachable HTTPS endpoint. Ensure the URL ends with `/`, which Retrofit requires.

## Android Gradle issues

- Select JDK 17 and install SDK 36.
- Run the checked-in wrapper, not a system Gradle: `gradlew.bat --version`.
- If caches are corrupt, stop Gradle with `gradlew.bat --stop`, then resync. Avoid deleting the whole user cache unless necessary.
- If OneDrive blocks native tools, move a clone to a short local development path or allow the build tool access; do not weaken production permissions.

## Notifications do not arrive

Verify all four Android Firebase identifiers, `firebase_messaging_installation_id_enabled`, notification permission, Google Play Services, backend service-account values, Cloud Messaging API enablement, and the `device_push_tokens` row. Backend notification records distinguish pending/failed delivery when credentials/provider calls fail.

## Thermal printer fails

Pair Bluetooth printers in system settings and grant Nearby Devices permission. For LAN printing, verify the phone can reach the printer IP and raw port (usually 9100), and that guest Wi-Fi client isolation is disabled. Confirm the printer supports ESC/POS and the selected 58mm/80mm width.

## pnpm selects an incompatible Node version

Use Node 22 LTS and confirm `node --version` before `pnpm install`. Remove neither source nor lockfiles. Re-run `pnpm install --frozen-lockfile`; Prisma client generation can then be run explicitly with `pnpm --filter @repairtrack/backend prisma:generate`.

## First-admin setup says completed

This is intentional. The setup lock makes initial provisioning one-time. Do not delete it. Recover an existing administrator through an approved operational process or an authenticated administration workflow.
