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
| Observability | Grafana + Prometheus |

## Quick start
```bash
cp .env.example .env
docker compose up -d      # postgres, n8n, grafana
pnpm install
pnpm db:deploy            # apply Prisma migrations to the dev database
pnpm dev                  # API on http://localhost:3000 and web dashboard on http://localhost:5173
```
- Swagger UI: <http://localhost:3000/docs> · Health: <http://localhost:3000/health>
- If a host port is already taken, change `POSTGRES_PORT`, `N8N_PORT` or `GRAFANA_PORT` in `.env`
  (and the port inside `DATABASE_URL` / `TEST_DATABASE_URL`).

### API (v0.1)
| Method | Path | Description |
|---|---|---|
| `POST` | `/postings` | Create a posting. `201`, `400` invalid body, `409` URL already exists (tracking params and fragments are ignored) |
| `GET` | `/postings?source=&q=&verdict=&createdSince=&page=1&pageSize=20` | Paginated list, newest first, each item with its `latestScore` (or `null`). `q` matches title, company and description; `verdict` (`fit`/`maybe`/`reject`/`unscored`) filters on the **latest** score; `createdSince` is an ISO 8601 instant. `400` on invalid values |
| `GET` | `/health` | `200` with DB status, `503` if the database is down |
| `GET` / `PUT` | `/profile` | The single candidate profile (`404` until saved; every `PUT` bumps `version`) |
| `POST` | `/postings/:id/score` | Score a posting against the profile. `201` (history is kept), `400` bad id, `404` unknown posting, `422` `profile_not_configured` / `ai_refused`, `429` `ai_budget_exceeded`, `502` `ai_provider_error`, `503` `ai_not_configured` |
| `GET` | `/postings/:id/score` | Latest score (`verdict`, `reasons`, `blockers`, profile/prompt version, model). `404` if never scored |
| `GET` | `/ai/usage` | Today's (UTC) AI spend vs. the daily budget, calls and tokens |

### AI configuration
| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `anthropic` (default, production target) or `groq` (cheap trials) |
| `ANTHROPIC_API_KEY` / `GROQ_API_KEY` | Key of the selected provider. The API boots without it; scoring answers `503` |
| `AI_MODEL` | Optional; defaults to `claude-sonnet-5-5` / `openai/gpt-oss-20b`. Needs a price in `ai/infrastructure/pricing.ts` |
| `AI_DAILY_BUDGET_USD` | Daily spend cap (UTC day). Over it, scoring answers `429` and no provider call is made |

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
- [ ] Week 4 – Dashboard, AWS deploy with Terraform, Grafana, live demo

## Author
Franz Yapu – Full Stack Developer · [Portfolio](https://franz-yapu.github.io) · [LinkedIn](https://linkedin.com/in/franz-jhonny-yapu-mamani-bab89018a)
