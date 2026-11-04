# SDD-004 – Web dashboard (React + Vite)

**Status:** Implemented (2026-11-04) · Approved (2026-11-04) · **Week:** 4 · **Depends on:** SDD-001, SDD-002, SDD-003

## Context
Everything is operated with `curl` or n8n. PRD feature 5 asks for a dashboard (list, filters, verdicts, links). The owner confirmed the brief with these additions: a profile screen, manual paste as versatile as possible, a UI switchable live between English and Spanish, and a future login for a SaaS deployment. The owner also wants to **upload a CV (PDF)** and have the profile (including academic data) extracted from it: that needs a new AI use case and a wider profile model, so it is split out (see Scope).

## Goal
A local web app where the candidate sees postings with verdict, reasons and blockers; filters and pages them; scores the unscored ones; adds a posting by pasting text; edits the profile; and switches language without reloading.

## Scope
**In:** `apps/web` (React 19, Vite, TypeScript strict, TanStack Query, Tailwind, React Router) · postings list with filters and paging · "Score now" · manual paste form · profile view/edit form · EN/ES switch · Playwright E2E · CORS config in the API · README + LOG.
**Out, as separate SDDs (needs your OK on the numbering):**
- **SDD-005 – CV import:** upload a PDF, extract text, `AiProvider` call that returns a structured profile (stack, seniority, locations, English level, plus new fields: education, experience, languages), user reviews and confirms before saving. Extends `Profile` (migration) and the scoring prompt.
- **SDD-006 – Accounts / SaaS:** login, per-user data (`userId` on profile, postings, scores, AI calls, budget per user), auth guard on every endpoint. This **contradicts the PRD** ("multi-user auth" out of scope), so it needs a PRD update and an ADR first.
- **SDD-007 – AWS deploy, Terraform, Grafana** (was SDD-005 in the README roadmap).
No login in SDD-004: the app runs locally for one candidate. It is built so auth can be added later: all API access goes through one client module, which will carry the token.

## Domain model
No new backend entities. Frontend view models come from `packages/shared` (`PostingListItem`, `ProfileResponse`, `SaveProfileBody`, `CreatePostingBody`), so API and UI share one contract. Filters live in the URL query string (shareable, survives reload).

## Ports & adapters
- `apps/web/src/api/client.ts`: the only module that calls `fetch`; validates every response with the shared Zod schemas; maps API errors (`404/422/429/502/503` machine codes from SDD-002) to typed errors.
- Dev: Vite proxy `/api` → `http://localhost:3000`. API: `@nestjs/cors` with `WEB_ORIGIN` env (default `http://localhost:5173`), no wildcard.
- i18n: `react-i18next` with two JSON dictionaries (`en`, `es`), language stored in `localStorage` and defaulting to the browser language. "Translator" here means UI translation through a dictionary: fast, free and deterministic. Machine translation of posting text would cost an AI call per posting and is out.
- Manual paste, "as versatile as possible": the user may paste **only the posting text**, or add title, company, URL, location and remote scope. Missing title/company/URL are filled client-side: the first non-empty line as title, company `—`, URL `manual:<sha-256 of the text>` (stable, so pasting the same text twice is deduped as `409`). `source = "manual"`. Optional checkbox "Score right away". No scraping from a URL.

## API contract
No new endpoints. One change: `CreatePostingSchema.url` accepts `manual:<hash>` in addition to http(s) URLs (a `ManualUrlSchema` in `packages/shared`; the dashboard shows it as plain text, not a link). Screens:
- `/` list: columns verdict badge, title, company, location, scope, published/created date, first reason; row expands to all reasons and blockers; link opens `url` in a new tab. Filters: verdict (incl. unscored), text (`q`), source, "last 24 h / 7 days / all"; page size 25.
- `/postings/new` paste form · `/profile` form (stack as chips, seniority, locations, English level, excluded contracts, summary) with the 404 "no profile yet" state leading to the form.
- "Score now" calls `POST /postings/:id/score`; on `429` shows "daily budget reached", on `503` "AI provider not configured".

## Data changes
None.

## Test plan
- Unit/component (Vitest + Testing Library): API client (parses, rejects invalid payloads, maps errors), filter ↔ URL sync, manual-paste field derivation and hash stability, i18n switch changes visible text with no reload, both dictionaries have the same keys (test).
- API: integration test for CORS headers (allowed and denied origin) and for `manual:` URLs on `POST /postings`.
- E2E (Playwright, against a throwaway DB and the **fake AI provider**, never Groq or Anthropic): save profile → paste a posting → score it → it shows its verdict → filter by verdict → switch to Spanish.
- `pnpm quality` includes web lint, typecheck and unit tests; E2E is `pnpm e2e` (needs the Playwright browser download, about 150 MB) and runs in CI as a separate job.

## Acceptance criteria
- From a clean clone, `pnpm dev` serves the dashboard on :5173 talking to the API on :3000, and every screen works with seeded data.
- The language switch updates the whole UI instantly and persists across reloads.
- Posting the same pasted text twice creates one posting.
- E2E passes with the fake provider; no real AI call is made by any test.
- No secrets in the web bundle (no API keys; it only knows the API base path).

## Risks
- **Scope creep:** CV import and accounts are real features, not tweaks; keeping them out keeps this SDD at three medium tasks (T1 skeleton + client + i18n, T2 list/filters/score/paste, T3 profile + E2E + CI).
- **Rework when auth arrives:** mitigated by the single API client and by keeping state in TanStack Query, not in components.
- **Browser download in CI/offline** for Playwright; E2E is a separate job so `pnpm quality` stays offline.
- **UI/verdict language mix:** reasons come from the model in whichever language it chooses; a later prompt option can pin it to the UI language.
