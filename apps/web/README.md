# @jobradar/web

React 19 + Vite + TypeScript dashboard (SDD-004).

```bash
pnpm dev          # from the repo root: API on :3000 and this app on http://localhost:5173
pnpm --filter @jobradar/web test
```

- All API calls go through `src/api/client.ts` (responses validated with the schemas of `@jobradar/shared`).
- In development the browser calls `/api/*` and Vite forwards it to the API (`VITE_API_TARGET`, default `http://localhost:3000`), so no CORS is involved. For a deployed build set `VITE_API_BASE` and the API's `WEB_ORIGIN`.
- UI texts live in `src/i18n/en.json` and `es.json` (a test keeps both with the same keys). The language is switched live and saved in the browser.

## End-to-end tests (Playwright)

```bash
pnpm --filter @jobradar/web exec playwright install chromium   # once, ~120 MB
pnpm e2e                                                       # from the repo root
```

`pnpm e2e` starts the real API on :3100 (`apps/api/e2e/server.ts`: real database, **deterministic fake AI**, never Groq or Anthropic) and Vite on :5174, so it does not collide with `pnpm dev`. The API **empties** its database, so it only starts against a name ending in `_test` or `_e2e` (`E2E_DATABASE_URL`, then `TEST_DATABASE_URL`). In CI it is a separate job so `pnpm quality` stays offline.
