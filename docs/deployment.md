# Deployment guide

## Recommended production topology

- Static `web/dist` on a CDN/static host (Vercel, Netlify, Cloudflare Pages, or equivalent)
- Stateless Node backend on Render, Railway, Fly.io, a container platform, or a hardened VPS
- Managed PostgreSQL with encryption, backups, point-in-time recovery, and private connectivity
- HTTPS reverse proxy/load balancer; managed secret store; SMTP and Firebase provider accounts

## Backend release

1. Provision PostgreSQL and create separate least-privilege migration/runtime roles where supported.
2. Configure all required environment values. Use a randomly generated `JWT_SECRET`; never reuse development values.
3. Build in CI:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @repairtrack/backend prisma:generate
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

4. Back up the database, then run `pnpm --filter @repairtrack/backend prisma:migrate` as a release job.
5. Start `node backend/dist/server.js` from the repository deployment artifact.
6. Configure health check `/health` and readiness `/ready`. Do not send traffic until readiness succeeds.
7. Set `TRUST_PROXY` to the actual trusted proxy hop count and `WEB_ORIGIN` to one exact HTTPS origin.

Required secrets include `DATABASE_URL` and `JWT_SECRET`. Provider values:

- Google: `GOOGLE_WEB_CLIENT_ID`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- FCM HTTP v1: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (newlines encoded as `\n` if the host requires one-line secrets)
- Future Daraja: `MPESA_ENVIRONMENT`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`

## Web release

Set `VITE_API_URL=https://api.example.com/api/v1` and `VITE_GOOGLE_CLIENT_ID`, then run `pnpm --filter @repairtrack/web build`. Publish `web/dist` and add an SPA fallback to `/index.html`. Add security headers at the host: strict CSP tailored to Google Identity, HSTS, `X-Content-Type-Options`, referrer policy, and restrictive permissions policy.

## Database operations

- Migrations run once as a release job, never concurrently on every replica.
- Use connection pooling appropriate for Prisma/host limits.
- Schedule encrypted backups and test point-in-time recovery.
- Monitor connection saturation, slow queries, disk, replica lag, and failed migrations.
- Roll back the application before attempting manual database reversal; forward-fix migrations are usually safer.

## Android release

Point `repairtrack.apiUrl` at the HTTPS API and configure Google/Firebase production identifiers through protected CI inputs. Build a signed AAB with `./gradlew bundleRelease`, test through internal/closed tracks, and keep signing material outside Git. Verify certificate fingerprints in Google Cloud after Play App Signing.

## Observability and incident readiness

Aggregate structured API logs using request IDs while excluding secrets/PII. Alert on readiness failures, 5xx/429 spikes, failed sign-ins, provider failures, mail/FCM backlog, database pressure, low stock job failures, and unusual tenant-access denials. Preserve immutable audit logs separately from application debug logs.

Document rotation for database, JWT, SMTP, Firebase, OAuth, and Android signing credentials. JWT-secret rotation invalidates outstanding access tokens; coordinate it with session revocation and user communication.
