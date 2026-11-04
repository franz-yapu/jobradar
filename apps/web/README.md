# @jobradar/web

React 19 + Vite + TypeScript dashboard (SDD-004).

```bash
pnpm dev          # from the repo root: API on :3000 and this app on http://localhost:5173
pnpm --filter @jobradar/web test
```

- All API calls go through `src/api/client.ts` (responses validated with the schemas of `@jobradar/shared`).
- In development the browser calls `/api/*` and Vite forwards it to the API (`VITE_API_TARGET`, default `http://localhost:3000`), so no CORS is involved. For a deployed build set `VITE_API_BASE` and the API's `WEB_ORIGIN`.
- **Accounts:** the app starts on the login screen (`/login`, `/register`). The session is an httpOnly cookie the browser sends by itself (`credentials: "include"`), so no token is ever readable by the app's JavaScript. `AuthProvider` knows the account through `GET /auth/me`; every protected route sits under `RequireAuth`; a 401 on any protected call (session ended) drops all cached data and returns to the login screen, and logging out or switching account also drops it, so the next person on the browser sees nothing of the previous one. `/settings/tokens` creates and revokes API tokens for n8n (the secret is shown once, kept only in that component's state).
- UI texts live in `src/i18n/en.json` and `es.json` (a test keeps both with the same keys). The language is switched live and saved in the browser.

## End-to-end tests (Playwright)

```bash
pnpm --filter @jobradar/web exec playwright install chromium   # once, ~120 MB
pnpm e2e                                                       # from the repo root
```

`pnpm e2e` starts the real API on :3100 (`apps/api/e2e/server.ts`: real database, **deterministic fake AI**, never Groq or Anthropic) and Vite on :5174, so it does not collide with `pnpm dev`. It empties the database, including users, so every run starts from zero. It only starts against a name ending in `_test` or `_e2e` (`E2E_DATABASE_URL`, then `TEST_DATABASE_URL`). In CI it is a separate job so `pnpm quality` stays offline.

The suite registers two accounts: it checks the anonymous redirect, account A's full flow (profile, manual postings, scoring, filters, EN/ES, CV import) and that account B starts empty and account A still sees its own data after logging back in.
