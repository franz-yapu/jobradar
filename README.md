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
pnpm dev                  # API on http://localhost:3000 (web dashboard arrives in SDD-004)
```
- Swagger UI: <http://localhost:3000/docs> · Health: <http://localhost:3000/health>
- If a host port is already taken, change `POSTGRES_PORT`, `N8N_PORT` or `GRAFANA_PORT` in `.env`
  (and the port inside `DATABASE_URL` / `TEST_DATABASE_URL`).

### API (v0.1)
| Method | Path | Description |
|---|---|---|
| `POST` | `/postings` | Create a posting. `201`, `400` invalid body, `409` URL already exists (tracking params and fragments are ignored) |
| `GET` | `/postings?source=&q=&page=1&pageSize=20` | Paginated list, newest first. `q` matches title, company and description |
| `GET` | `/health` | `200` with DB status, `503` if the database is down |

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
- [ ] Week 2 – AI scoring agent + tests + prompt evals
- [ ] Week 3 – n8n workflows (collect postings, notify)
- [ ] Week 4 – Dashboard, AWS deploy with Terraform, Grafana, live demo

## Author
Franz Yapu – Full Stack Developer · [Portfolio](https://franz-yapu.github.io) · [LinkedIn](https://linkedin.com/in/franz-jhonny-yapu-mamani-bab89018a)
