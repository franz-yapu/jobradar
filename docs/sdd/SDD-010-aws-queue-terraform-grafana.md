# SDD-010 – Batch scoring queue (SQS + Lambda), Terraform and Grafana

**Status:** Approved (2026-11-06) · T1 done · **Week:** 4 · **Depends on:** SDD-002, 009 · **Split:** 010a queue + worker, 010b Terraform, 010c Grafana

## Context
Scoring is synchronous (`POST /postings/:id/score`) and "Score the newest jobs" makes the web call it up to 10 times in a row, so the browser must stay open and one slow or failing call stalls the rest. The README promises SQS, Lambda, Terraform and Grafana, but none exists: no queue port, no worker, no infra, no dashboards. `ai_calls` already stores tokens, latency, cost and status per call.

## Goal
Batch scoring runs in the background through a queue (SQS + Lambda in AWS, in-process locally); single-posting scoring stays synchronous; AWS is reproducible with Terraform; Grafana shows AI latency, tokens and cost from Postgres.

## Scope
**In:** `ScoringQueue` port with an in-process adapter (default) and an SQS adapter (`SQS_QUEUE_URL` set) · batch endpoints · worker Lambda · LocalStack integration test · Terraform for SQS (+DLQ), Lambda, IAM, S3 (Lambda artifacts and Terraform state), budget alarm · Grafana provisioning (datasource + dashboards) · docs, LOG.
**Out:** RDS / hosting the API and web (separate decision, SDD-012), Prometheus and `/metrics`, making single scoring asynchronous, storing CVs in S3, CD pipeline, `terraform apply` by Claude (the owner applies).

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 (010a) ✅ | Domain: `ScoringBatch`, `ScoringJob`, `ScoringQueue` port; use cases `StartScoringBatch`, `GetScoringBatch`, `ProcessScoringJob`; Prisma repo + migration; in-process adapter | Unit tests, Supertest |
| T2 (010a) | `SqsScoringQueue` adapter, worker handler (Lambda entry point), internal endpoint | LocalStack integration test |
| T3 (010a) | Web: "Score the newest jobs" starts a batch and polls progress | Component tests, E2E |
| T4 (010b) | Terraform modules + `plan` in CI (no apply) | `terraform validate`, `plan` |
| T5 (010c) | Grafana provisioning + dashboards, README screenshots | Local `docker compose up`, manual check |

## Domain model
- `ScoringBatch { id, userId, requested, createdAt }`.
- `ScoringJob { id, batchId, userId, postingId, status: queued | done | failed, errorCode?, updatedAt }`, unique `(batchId, postingId)`.
- Batch progress is derived from its jobs. A batch takes the caller's newest unscored postings (mine + catalog), at most 10.

## Ports & adapters
- `ScoringQueue.enqueue(jobs: {jobId, userId, postingId}[])` (domain, no AWS types).
- `InProcessScoringQueue`: runs `ProcessScoringJob` after the response, one by one. Default, so `docker compose up` still works with no AWS.
- `SqsScoringQueue`: sends one message per job; DLQ after 3 receives.
- `ProcessScoringJob` loads the job, skips it if already `done` (idempotent), calls the existing `ScorePosting` as that user, stores `done` or `failed` with the machine error code. `ai_budget_exceeded` marks the remaining jobs of the batch `failed` without more AI calls.
- **Worker:** the Lambda holds no database credentials. It calls `POST /internal/scoring/jobs/:id/process` on the API, authenticated by an HMAC of the body with `WORKER_SECRET` (SSM Parameter Store, never `.env` in the cloud), constant-time compare, replay window of 5 minutes. The API stays the only place that touches Prisma and the AI provider (metering and budget unchanged).

## API contract
| Endpoint | Behaviour |
|---|---|
| `POST /scoring/batches` | body `{ limit?: 1..10 }` · `202 { id, requested }`; `422 profile_not_configured`; `200` with `requested: 0` when nothing is unscored |
| `GET /scoring/batches/:id` | `{ id, requested, done, failed, queued, errors[] }`; another account's batch → `404` |
| `POST /internal/scoring/jobs/:id/process` | worker only, `401` without a valid signature; hidden from Swagger |
`POST /postings/:id/score` is unchanged.

## Data changes
Two tables (`scoring_batches`, `scoring_jobs`), indexes on `batchId` and `(status)`; migration generated with `prisma migrate diff`. New env: `SQS_QUEUE_URL`, `AWS_REGION`, `WORKER_SECRET` (all optional; empty = in-process). Terraform outputs the queue URL and the Lambda name.

## Test plan
Unit: each use case with in-memory repos and queue (idempotency, budget stop, ownership). Integration (Supertest): batch isolation between accounts, signature check (missing, wrong, stale). LocalStack: enqueue → worker → API → `done`; poison message lands in the DLQ. Web component tests and one E2E. Terraform: `fmt`, `validate`, `plan` against a mock account is not possible, so the first `plan`/`apply` is run by the owner. `pnpm quality` stays offline.

## Acceptance criteria
1. With no AWS variables, batch scoring works locally and the browser can be closed after the `202`.
2. With `SQS_QUEUE_URL`, jobs flow through SQS and the Lambda; a re-delivered message scores nothing twice.
3. A budget stop or provider error shows in the batch (`failed` + code) and never loops.
4. `terraform plan` creates only SQS, DLQ, Lambda, IAM, S3 and a budget alarm; `terraform destroy` removes everything.
5. Grafana dashboards (latency p50/p95, tokens, cost per day and per model, error rate) render from `ai_calls` after `docker compose up`.
6. No secret in the repo or Terraform state in plain variables; Lambda role has least privilege (consume one queue, read two SSM parameters).

## Risks
- **The Lambda must reach the API:** it needs a public HTTPS URL for the API, which does not exist until hosting is decided (SDD-012). Until then 010b can be planned but not run end to end. The worker secret is the only protection of the internal endpoint.
- **Cost:** Lambda, SQS and S3 are inside the free tier; budget alarm at US$5/month as a net. Real AI spend stays under `AI_DAILY_BUDGET_USD`.
- **Cannot verify here:** no Terraform or AWS credentials on this machine; Claude validates and writes, the owner applies.
- **Grafana on Postgres** needs a read-only database role (created in the migration of 010c), never the app role.
- Residual security risks (per-process throttle, public Swagger) are not worsened but remain.

## Open questions for approval
1. OK with the worker calling the API over HTTP (no DB credentials in Lambda) instead of reaching RDS?
2. OK that 010b/010c are written and validated now, and the end-to-end AWS run waits for hosting (SDD-012)?
