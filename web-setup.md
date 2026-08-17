# Web application setup

## Configure

Copy `web/.env.example` to `web/.env`:

```dotenv
VITE_API_URL=http://localhost:4000/api/v1
VITE_GOOGLE_CLIENT_ID=
```

`VITE_*` values are embedded at build time and are public. Put only the Google web client ID here—never an OAuth client secret, service-account key, SMTP password, or backend secret.

The backend `WEB_ORIGIN` must exactly match the browser origin, including scheme and port. The backend `GOOGLE_WEB_CLIENT_ID` and web `VITE_GOOGLE_CLIENT_ID` must identify the same web OAuth client.

## Run and build

```bash
pnpm --filter @repairtrack/web dev
pnpm --filter @repairtrack/web lint
pnpm --filter @repairtrack/web typecheck
pnpm --filter @repairtrack/web test
pnpm --filter @repairtrack/web build
pnpm --filter @repairtrack/web exec vite preview
```

The production output is `web/dist/`. Configure the hosting platform to serve `index.html` for unknown client-side routes such as `/repairs/:id`, `/login`, and `/track/:token`.

## Session behavior

The access token is held only in React memory. The API refresh cookie is `HttpOnly`, and Axios performs one synchronized refresh/retry when a request receives `401`. Reloading the page restores the session through the cookie. Sign-out revokes the server session.

## Browser support and layout

Use current Chrome, Edge, Firefox, or Safari. The Material UI shell collapses navigation on small screens and supports role-specific menus, loading/error/empty states, accessible controls, and light/dark preference.
