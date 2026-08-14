# Backend and first-administrator setup

## 1. Prepare PostgreSQL

Copy `backend/.env.example` to `backend/.env`. Set a real PostgreSQL URL and a random `JWT_SECRET` of at least 32 characters. The runtime database account should own only the RepairTrack database and must not be a PostgreSQL superuser.

Docker example from the repository root:

```bash
export POSTGRES_PASSWORD='strong-local-password'
docker compose up -d postgres
```

PowerShell uses `$env:POSTGRES_PASSWORD = 'strong-local-password'`. Match that value in:

```dotenv
DATABASE_URL=postgresql://repairtrack:strong-local-password@localhost:5432/repairtrack?schema=public
```

## 2. Install and migrate

```bash
pnpm install
pnpm --filter @repairtrack/backend prisma:generate
pnpm --filter @repairtrack/backend prisma:migrate
```

`prisma:migrate` runs `prisma migrate deploy`, which applies committed migrations and never creates demo rows. Verify `GET /ready` only after the API is running.

## 3. Create the initial super administrator

Run this in an interactive terminal on the trusted backend host:

```bash
pnpm --filter @repairtrack/backend setup:admin -- --email owner@example.com --name "Platform Owner"
```

The CLI:

- rejects redirected/non-interactive password input;
- hides the password while entered and enforces the same strong password policy as the API;
- hashes it with Argon2id;
- creates the `SUPER_ADMIN` role/user and `SetupLock` in one serializable transaction;
- marks the initial email verified; and
- refuses every subsequent setup attempt.

Do not delete the setup lock to create another administrator. Use an authenticated, audited administration workflow for later accounts.

## 4. Start services

```bash
pnpm --filter @repairtrack/backend dev
pnpm --filter @repairtrack/web dev
```

Test `http://localhost:4000/health`, then `http://localhost:4000/ready`. The latter must return success before sign-in.

## 5. Create the first business

Sign in as the super administrator, open Businesses, and provide the business plus its primary administrator. The administrator receives an expiring password-setup link through configured SMTP. In local development without SMTP, configure a mail provider before expecting delivery; the API does not expose invitation tokens in responses.

## Recovery

Back up PostgreSQL before recovery work. If the only super administrator loses access, use an audited operational runbook and database owner approval; never add a hard-coded emergency password or remove the setup lock casually.
