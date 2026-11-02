# SDD-001 – API skeleton, Postings module, Docker & CI

**Status:** Approved (2026-11-02) · Implemented locally (T1–T4), CI pending first push · **Week:** 1

## Goal
A running NestJS API with hexagonal structure, PostgreSQL via Prisma, the `postings` module (create/list), Docker and CI.

## Scope
In: monorepo (pnpm workspaces), apps/api, packages/shared, `postings` module, health endpoint, Swagger, CI.
Out: AI scoring (SDD-002), n8n (SDD-003), web (SDD-004), Kafka (see `docs/decisions/LOG.md`).

## Tasks
Each task is one PR with small Conventional Commits.

| # | Task | Content | Verifiable output |
|---|---|---|---|
| T1 | Monorepo & tooling | `git init`, pnpm workspaces, shared strict tsconfig, ESLint, Vitest, root scripts (`dev`, `test`, `lint`, `typecheck`, `quality`) | `pnpm quality` is green on the empty skeleton |
| T2 | Shared + API base + Health | `packages/shared` with Zod, NestJS app in `apps/api`, Prisma + Postgres, `health` module, Swagger at `/docs`, `.env` config | `docker compose up -d && pnpm dev` starts; `/health` and `/docs` respond |
| T3 | Postings: create & list | Domain, `CreatePosting` and `ListPostings` use cases, Prisma and in-memory repositories, `POST` and `GET /postings` controller with Zod | Unit tests for use cases, Supertest tests for both endpoints |
| T4 | CI & closing | Adjust `ci.yml` if needed, Prisma migration generated with `prisma migrate`, README quick start and week-1 roadmap | CI green, acceptance criteria met |

## Domain model
`Posting { id, title, company, url (unique, normalized), source, location?, remoteScope, description, publishedAt?, createdAt }`

- `remoteScope`: `worldwide | latam | country | onsite | unknown`.
- `location` and `publishedAt` are optional (nullable): RSS feeds often omit them.
- URL normalization before dedupe: lowercase host, strip fragment and tracking params (`utm_*`, `ref`, `fbclid`, `gclid`), drop trailing slash.

## Ports & adapters
- Port `PostingRepository { save(p), findByUrl(url), list(filter) }`
- Adapters: `PrismaPostingRepository`, `InMemoryPostingRepository` (tests)
- Domain and application layers import no framework (see ADR-0001).

## API contract
Request and response schemas live in `packages/shared` (Zod).

- `POST /postings` – body validated with Zod. 201 with the created posting, 400 on invalid body, 409 if the normalized URL exists.
- `GET /postings?source=&q=&page=1&pageSize=20` – `q` matches title, company and description (case-insensitive). Response: `{ items, page, pageSize, total }`. Defaults: `page=1`, `pageSize=20`, max `pageSize=100`. Ordered by `createdAt` descending.
- `GET /health` – 200 with `{ status, db }`; 503 if the database is unreachable.

## Test plan
- Unit: `CreatePosting` (new, duplicate URL, normalization) and `ListPostings` (filters, pagination) with the in-memory adapter.
- Integration: Supertest for `POST /postings`, `GET /postings` and `GET /health` against Postgres. Locally it uses the `docker compose` Postgres, in CI the Postgres service. Both use a separate `jobradar_test` database. No Testcontainers.

## Decisions
- pnpm with Node 22.
- Prisma version pinned in T2. Any extra configuration it needs is recorded in `docs/decisions/LOG.md`.
- Prisma migrations are generated with `prisma migrate`, never edited by hand.

## Acceptance criteria
- `docker compose up -d && pnpm dev` starts the API; Swagger at `/docs`.
- `pnpm quality` passes locally and in GitHub Actions.
- Every use case has unit tests and every endpoint has an integration test.
- Duplicate URLs (including tracking-param variants) return 409.
