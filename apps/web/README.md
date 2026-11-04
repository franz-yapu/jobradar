# @jobradar/web

React 19 + Vite + TypeScript dashboard (SDD-004).

```bash
pnpm dev          # from the repo root: API on :3000 and this app on http://localhost:5173
pnpm --filter @jobradar/web test
```

- All API calls go through `src/api/client.ts` (responses validated with the schemas of `@jobradar/shared`).
- In development the browser calls `/api/*` and Vite forwards it to the API (`VITE_API_TARGET`, default `http://localhost:3000`), so no CORS is involved. For a deployed build set `VITE_API_BASE` and the API's `WEB_ORIGIN`.
- UI texts live in `src/i18n/en.json` and `es.json` (a test keeps both with the same keys). The language is switched live and saved in the browser.
