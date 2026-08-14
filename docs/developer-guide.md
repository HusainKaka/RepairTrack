# Developer guide

## Code organization

- `backend/src/app.ts` composes middleware and module routers. Business logic is grouped under `modules`; shared security/document helpers are under `lib`; generated Prisma code is not edited.
- `web/src/App.tsx` declares lazy route chunks and role guards. API/session concerns live under `api` and `auth`; reusable UI is under `components`.
- `android/app/src/main` follows MVVM/repository boundaries: Retrofit DTO/API, Room entities/DAOs, repository, Hilt modules, ViewModels, Compose screens, sync, security, scanner, notifications, and printer layers.

## Change workflow

1. Create a focused branch such as `feature/repair-management`.
2. Add/modify schema through Prisma and create a named migration.
3. Enforce role, tenant, and object ownership in the backend before exposing UI.
4. Validate request bodies/params and return standard error codes/messages.
5. Wrap multi-record invariants and their audit event in one transaction.
6. Add tests at the lowest useful layer plus an integration test for access boundaries.
7. Run lint, type checks, tests, builds, Prisma validation, and Android lint where affected.
8. Update API/setup/security documentation and review `git diff --check` before commit.

Suggested long-lived branches are `main` and optional `develop`; short-lived examples include `feature/authentication`, `feature/repair-management`, `feature/invoicing`, `feature/android-app`, and `feature/web-dashboard`. Protect `main` with CI and review.

## API conventions

All routes live under `/api/v1`. Use `authenticate`, `authorize`, `requireBusiness`, and `validate`; do not trust client-side role checks. Prefer `findFirst` with `id + businessId + ownership` over fetching by ID and checking later. Public projections must be explicitly selected.

Never log credentials/tokens, return provider secrets, use user-controlled raw SQL, accept payment callbacks without verification, or store device passcodes in this schema.

## Database changes

Edit `backend/prisma/schema.prisma`, run `prisma:migrate:dev`, inspect SQL, regenerate client, and commit schema plus migration. Use a fresh disposable PostgreSQL database in CI. Never rewrite an applied migration.

## Adding a new Android offline mutation

Only queue idempotent/non-financial operations. Add an explicit mutation kind and serialized payload, use a UUID idempotency key, make the backend endpoint idempotent, define conflict behavior, and extend `SyncWorker` tests. Payments and other irreversible financial writes stay online.

## Extending providers

Provider adapters must fail visibly when unconfigured, persist provider IDs/failure states, use timeouts/retries with idempotency, verify callbacks, and keep secrets server-side. See [M-Pesa](mpesa-integration.md), [Google](google-sign-in.md), and [deployment](deployment.md).
