# Decision log

## 2026-11-02 – Kafka not used in v1; SQS behind a port
- **Decision:** No Kafka in SDD-001..005. The async hand-off to the AI worker uses SQS, behind a domain port (e.g. `ScoringQueue` / `PostingEventPublisher`).
- **Why:** Single user, low volume. SQS covers queue, retries and DLQ with near-zero ops and fits the AWS free tier. MSK is costly and a local broker adds weight. ADR-0001 already rejects unneeded complexity.
- **Revisit if:** we need event replay (re-score old postings with a new prompt) or several independent consumers per event.
- **Escape hatch:** add a `KafkaScoringQueue` adapter (Redpanda locally) as an optional SDD-006 + ADR, without touching use cases.

## 2026-11-02 – Local ports and RAG direction
- **Ports:** `docker-compose.yml` host ports are overridable via env (`POSTGRES_PORT`, `N8N_PORT`, `GRAFANA_PORT`). Defaults stay 5432/5678/3001. On the dev machine 5432, 5433 and 5678 are taken by other projects, so local `.env` uses `POSTGRES_PORT=5434`.
- **RAG:** allowed for later SDDs (answer drafting from the candidate profile, SDD-002+). Plan: pgvector inside the same PostgreSQL, behind a domain port (e.g. `ProfileRetriever`), so the embedding provider and store can change. Not part of SDD-001. When needed, switch the compose image to `pgvector/pgvector:pg16` and record an ADR.

## 2026-11-02 – Stack versions pinned in SDD-001/T2
- NestJS 12 (ESM-only) → `apps/api` is `"type": "module"`, relative imports use `.js`.
- Prisma 7.10.1 (latest stable; 8.x is RC). Needs the `@prisma/adapter-pg` driver adapter, `prisma.config.ts`, and a generated client in `src/generated` (git-ignored, built by `postinstall`).
- TypeScript 5.9 (typescript-eslint does not support 7 yet).

## 2026-11-02 – CI uses a throwaway `jobradar_test` database
- The CI Postgres service is created with `POSTGRES_DB=jobradar_test` and both `DATABASE_URL` and `TEST_DATABASE_URL` point to it, so integration tests (which apply migrations and delete data) never run against a database named like a real one. Matches the local setup (`jobradar_test` from `infra/postgres/init`).
