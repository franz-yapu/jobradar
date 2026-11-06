# JobRadar

> AI-powered job radar: n8n collects job postings, an AI agent scores them against a candidate profile, and a dashboard shows the verdict and drafts application answers.

![CI](https://github.com/franz-yapu/jobradar/actions/workflows/ci.yml/badge.svg)

## Why
Job hunting means reading dozens of postings to find the few that fit. JobRadar automates the screening:
remote scope, seniority, English level, contract type and stack match, with a clear verdict per posting.

## Architecture
```
 n8n (RSS / webhooks) ──► API (NestJS, hexagonal) ──► SQS ──► AI worker (Claude tool use)
                              │                                   │
                              ▼                                   ▼
                       PostgreSQL (Prisma)  ◄──────────── scores + drafted answers
                              │
                              ▼
                     Web dashboard (React + Vite)        Grafana: latency, tokens, cost
```

## Stack
| Layer | Tech |
|---|---|
| Backend | NestJS, TypeScript (strict), hexagonal architecture, Prisma, PostgreSQL |
| AI | Anthropic SDK (tool use), provider-agnostic port (Claude / OpenAI / Gemini), promptfoo evals |
| Automation | n8n (self-hosted, workflows exported in `n8n/workflows`) |
| Frontend | React 19, Vite, TypeScript, TanStack Query, Tailwind |
| Cloud | AWS (S3, SQS, Lambda, RDS) provisioned with Terraform |
| Quality | Vitest, Supertest, Playwright, ESLint, GitHub Actions |
| Observability | Grafana reading `ai_calls` through a read-only role (no Prometheus), see `infra/grafana/README.md` |

## Quick start
```bash
cp .env.example .env
docker compose up -d      # postgres, n8n, grafana
pnpm install
pnpm db:deploy            # apply Prisma migrations to the dev database
pnpm dev                  # API on http://localhost:3000 and web dashboard on http://localhost:5173
pnpm e2e                  # Playwright end-to-end test of the dashboard (disposable DB, fake AI)
```
- Swagger UI: <http://localhost:3000/docs> · Health: <http://localhost:3000/health>
- If a host port is already taken, change `POSTGRES_PORT`, `N8N_PORT` or `GRAFANA_PORT` in `.env`
  (and the port inside `DATABASE_URL` / `TEST_DATABASE_URL`).

### API (v0.1)

Every endpoint except `/health`, `/docs` and `/auth/register|login|logout` needs the session cookie (`jr_session`: `httpOnly`, `SameSite=Lax`, `Secure` in production, 14 days). Writes that carry an `Origin` header must come from `WEB_ORIGIN` (`403 bad_origin`). Set `ALLOW_SIGNUP=false` to close registration.

Data belongs to the account that created it: postings (unique per account and URL), the profile, scores and the AI spend and daily budget. Another account's resource answers `404`, never `403`. The first account ever created adopts the rows that predate accounts.

| Method | Path | Description |
|---|---|---|
| `POST` | `/postings` | Create a posting (private by default; an administrator can send `"scope": "catalog"` to publish to the shared catalog). `201`, `400` invalid body, `403` `not_admin`, `409` URL already exists (tracking params and fragments are ignored) |
| `GET` | `/postings?source=&q=&verdict=&createdSince=&page=1&pageSize=20` | Your own postings plus the shared catalog (`scope` optional filter: `mine` / `catalog`), paginated, newest first, each item (with its `scope`) with its `latestScore` (or `null`). `q` matches title, company and description; `verdict` (`fit`/`maybe`/`reject`/`unscored`) filters on the **latest** score; `createdSince` is an ISO 8601 instant. `400` on invalid values |
| `GET` | `/health` | `200` with DB status, `503` if the database is down |
| `POST` | `/auth/register` | Create an account (email + password of 10-128 characters) and log in. `201` + session cookie, `400` invalid / `weak_password`, `403` `signup_disabled`, `409` `email_taken`, `429` `too_many_attempts` |
| `POST` | `/auth/login` | `200` + session cookie; `401` `invalid_credentials` (same answer for an unknown email), `429` `too_many_attempts` (5 failures per email / 20 per address every 15 minutes, `Retry-After`) |
| `POST` | `/auth/logout` | `204`; deletes the session on the server and clears the cookie |
| `GET` | `/auth/me` | The logged-in user, `401` otherwise |
| `GET` / `POST` / `DELETE` | `/auth/tokens` · `/auth/tokens/:id` | Personal API tokens for n8n and scripts (`Authorization: Bearer jr_...`). Create returns the secret **once** (`201`), list never shows it, revoke is immediate (`204`, `404` for another account's token). Max 10 active; they act as their owner and cannot manage tokens (`403` `session_required`) |
| `GET` / `PUT` | `/profile` | The single candidate profile (`404` until saved; every `PUT` bumps `version`). Besides the criteria it holds `education`, `experience`, `languages` and `certifications` (optional lists) |
| `POST` | `/profile/import-cv` | Upload a CV (`multipart/form-data`, field `file`, PDF up to 5 MB / 15 pages). Returns a **draft** profile to review (`200`, nothing is stored; `warnings` lists what could not be found). `400` no file, `413` too large, `415` `cv_not_pdf`, `422` `cv_no_text` / `cv_too_long` / `ai_refused`, `429` `ai_budget_exceeded`, `502` `ai_provider_error`, `503` `ai_not_configured`. The CV text is sent to the configured AI provider; contact data is never asked for nor stored |
| `POST` | `/postings/:id/score` | Score a posting against the profile. `201` (history is kept), `400` bad id, `404` unknown posting, `422` `profile_not_configured` / `ai_refused`, `429` `ai_budget_exceeded`, `502` `ai_provider_error`, `503` `ai_not_configured` |
| `POST` | `/scoring/batches` | Queue the newest unscored postings (own + catalog) for background scoring. Body `{ "limit": 1..10 }` (default 10). `202 { id, requested }`, `200 { id: null, requested: 0 }` when nothing is left, `400` bad limit, `422 profile_not_configured` |
| `GET` | `/scoring/batches/:id` | Progress of a batch: `requested`, `queued`, `done`, `failed` and `errors[{ postingId, code }]`. `404` for another account's batch |
| `GET` | `/postings/:id/score` | Latest score (`verdict`, `reasons`, `blockers`, profile/prompt version, model). `404` if never scored |
| `GET` | `/ai/usage` | Today's (UTC) AI spend vs. the daily budget, calls and tokens |

### AI configuration
| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `anthropic` (default, production target) or `groq` (cheap trials) |
| `ANTHROPIC_API_KEY` / `GROQ_API_KEY` | Key of the selected provider. The API boots without it; scoring answers `503` |
| `AI_MODEL` | Optional; defaults to `claude-sonnet-5-5` / `openai/gpt-oss-20b`. Needs a price in `ai/infrastructure/pricing.ts` |
| `AI_DAILY_BUDGET_USD` | Daily spend cap (UTC day). Over it, scoring answers `429` and no provider call is made |
| `SQS_QUEUE_URL` | Optional. Batch scoring (`POST /scoring/batches`) runs in the API process; with a queue URL it goes through SQS and the worker (`apps/worker`) calls back the API. Needs `WORKER_SECRET` (32+ chars). `AWS_REGION`, and `AWS_ENDPOINT_URL` for LocalStack, are optional |

Every AI call (including failures and budget blocks) is logged in `ai_calls` with tokens, latency and cost.
A verdict can never contradict its blockers: any blocker forces `reject` in the domain, not in the prompt.

### Prompt evals
`apps/api/evals` holds 32 labelled postings (ES/EN, synthetic, incl. prompt-injection attempts; add your own anonymized real
ones to `dataset/real.yaml`) and a [promptfoo](https://promptfoo.dev) config that runs the **real** scoring pipeline.
```bash
pnpm --filter @jobradar/api eval         # CALLS THE PAID API (~0.006 USD with a small model): 32 postings
pnpm --filter @jobradar/api eval:check   # re-print metrics from evals/results/latest.json
```
The candidate profile the evals score against lives in `apps/api/evals/profiles/*.json` (same fields and validation as `PUT /profile`).
`franz.json` is the default; to change criteria edit it, switch `defaultTest.vars.profile` in `evals/promptfooconfig.yaml` to
`file://profiles/example.json`, or add your own file. The labels in `dataset/` assume a senior TypeScript/Node profile with remote work from Bolivia.

Thresholds (exit code 1 if missed): verdict accuracy ≥ 85%, hard-blocker recall ≥ 90%, **0** `fit` on postings labelled `reject`.
Cost and latency are reported. Evals are not part of `pnpm quality` or CI. Results are stored in `docs/decisions/LOG.md`.

### Quality
```bash
pnpm quality              # lint + typecheck + test (needs Postgres running)
```
Integration tests use `TEST_DATABASE_URL` (falls back to `DATABASE_URL`), apply migrations themselves and **delete data** in that database,
so point it at a throwaway database such as `jobradar_test` (created by `docker compose`).

## Sign in with Google (optional)

Off by default: the button only appears when the three `GOOGLE_*` variables are set. Setup takes about five minutes and costs nothing.

1. Open <https://console.cloud.google.com>, create a project (e.g. `JobRadar`).
2. **Google Auth Platform** (search for it in the top bar) → **Get started**: app name `JobRadar`, your email as support and contact email, audience **External**.
3. **Audience** → leave it in *Testing* and add your own Gmail (and anyone who will try it) under **Test users**. Only they can sign in until you publish the app. `openid` and `email` are not sensitive scopes, so publishing later needs no Google review.
4. **Clients** → **Create client** → type **Web application** → under **Authorized redirect URIs** add `http://localhost:3000/auth/google/callback` (add the production URL later; it must match `GOOGLE_REDIRECT_URI` exactly). **Create**, then copy the client ID and the client secret.
5. Put them in `.env` (never in chat, never in git):
   ```
   GOOGLE_CLIENT_ID=<client id>
   GOOGLE_CLIENT_SECRET=<client secret>
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```
6. Restart the API. The login screen now shows **Continue with Google**.

How it is secured is in `docs/adr/ADR-0003-google-sign-in.md` and `docs/security-review.md`.

### Administrator and the shared catalog
Jobs are collected once for everybody (the **shared catalog**) and every account sees them; profiles, verdicts and AI spend stay personal. The administrator is the account whose email is in `ADMIN_EMAILS` (in `.env`, comma separated) **and** that signed in with Google, because only Google verifies the email. The administrator creates the n8n token (API tokens screen, visible only to them); jobs published by n8n go to the catalog.

## Project structure
```
apps/api        NestJS API (domain / application / infrastructure)
apps/web        React dashboard
packages/shared Shared types and schemas (Zod)
n8n/workflows   Exported n8n workflows (JSON)
infra/terraform AWS infrastructure
docs/           PRD, ADRs, SDDs (one per ticket)
```

## How this project is built
Spec-Driven Development with AI coding agents: every ticket has a design doc (`docs/sdd/`) approved before code,
architecture decisions live in `docs/adr/`, and Claude Code follows the rules and skills in `.claude/`.

## Roadmap
- [x] Week 1 – API skeleton, hexagonal structure, Postgres, Docker, CI
- [ ] Week 2 – AI scoring agent + tests + prompt evals (scoring and eval harness done; thresholds pending on Claude, see `docs/decisions/LOG.md`)
- [x] Week 3 – n8n workflows: collect + score Get on Board postings, daily Telegram summary (`n8n/workflows/README.md`; Telegram delivery verified live)
- [x] Week 4a – Web dashboard (list, filters, scoring, manual paste, profile, EN/ES, Playwright E2E)
- [x] Week 4b – CV import from a PDF and admin-style interface (SDD-005)
- [x] Week 4c – Accounts / SaaS: per-account data, login/register, API tokens, two-account E2E (SDD-006, see `docs/security-review.md`)
- [x] Week 4d – Profile assist and token guide (SDD-007), Google sign-in (SDD-008)
- [x] Week 4e – Shared job catalog, administrator role and guided first use (SDD-009, ADR-0004)
- [ ] Week 4f – AWS deploy with Terraform, Grafana (SDD-010), live demo

## Author
Franz Yapu – Full Stack Developer · [Portfolio](https://franz-yapu.github.io) · [LinkedIn](https://linkedin.com/in/franz-jhonny-yapu-mamani-bab89018a)
