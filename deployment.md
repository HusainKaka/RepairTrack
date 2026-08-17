# Deployment guide

## Vercel topology

Use two Vercel projects connected to the same GitHub repository:

| Vercel project | Root Directory | Purpose |
|---|---|---|
| `repairtrack-api` | `backend` | Express API as a Vercel Function |
| `repair-track-web` | `web` | React/Vite static web application |

The backend's `vercel.json` routes requests to the Express adapter in `backend/api`. The web `vercel.json` publishes `dist` and provides a React Router SPA fallback.

## Database first

Provision managed PostgreSQL/Neon with backups and point-in-time recovery. Keep two connection strings when the provider supplies them:

- pooled runtime URL for `DATABASE_URL` in the deployed API;
- direct/non-pooled URL for the one-time Prisma migration command.

Before a production schema change, create a restore point. From a trusted local PowerShell terminal, temporarily set the direct URL using single quotes so `&` characters remain part of the string:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&channel_binding=require'
pnpm --filter=@repairtrack/backend prisma:generate
pnpm --filter=@repairtrack/backend prisma:migrate
```

Clear the session value afterward with `Remove-Item Env:DATABASE_URL`. Migrations run once as a release step, not on every Vercel build.

## Backend Vercel project

Import the repository and set Root Directory to `backend`. Use:

- Framework Preset: `Other`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm prisma:generate && pnpm build`
- Output Directory: leave blank

Required Production environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | pooled production PostgreSQL URL |
| `JWT_SECRET` | random secret of at least 32 characters |
| `WEB_ORIGIN` | exact public web URL, for example `https://repair-track-web.vercel.app` |
| `PUBLIC_WEB_URL` | the same exact public web URL |
| `TRUST_PROXY` | `1` |

Add optional integration values from `backend/.env.example` only when configured with the provider. Never paste `KEY=value` into one box: Vercel's **Key** field receives only the name and **Value** receives only the value.

After deployment, verify:

- `https://YOUR-API.vercel.app/health`
- `https://YOUR-API.vercel.app/ready`

The first confirms the function is running; the second confirms database connectivity.

## Web Vercel project

Import the same repository again as a separate project and set Root Directory to `web`. Use:

- Framework Preset: `Vite`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`

Production environment variables:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://YOUR-API.vercel.app/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web client ID, or omit until Google login is configured |

Redeploy the web project after changing any `VITE_*` value because Vite embeds it at build time. Then copy the final web domain back into the API's `WEB_ORIGIN` and `PUBLIC_WEB_URL` and redeploy the API.

## Production validation

Run locally before uploading:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter=@repairtrack/backend prisma:validate
```

After Vercel reports both projects as Ready, follow the manual checklist in [business upgrades](business-upgrades.md). Review function logs for failed provider calls, database connection pressure, 401/403 spikes, and 5xx responses. Configure provider credentials, alerting, retention, mail-domain authentication, and a restore drill before processing real customer data.
