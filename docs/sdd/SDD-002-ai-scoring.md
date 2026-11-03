# SDD-002 – Candidate profile, AI provider port and posting scoring

**Status:** Approved (2026-11-02) · **Week:** 2 · **Depends on:** SDD-001

## Context
Postings can be stored (SDD-001) but nothing judges them. PRD features 2 (profile & criteria) and 3 (AI scoring agent) plus the AI cost/latency/budget requirements are covered here. Answer drafting (feature 4) and RAG are out; they will reuse the port defined here (SDD-002b/006).

## Goal
Given the candidate profile, score a stored posting with a verdict (fit / maybe / reject), reasons and detected hard-blockers, logging tokens, latency and cost of every AI call and enforcing a daily budget.

## Scope
In: single candidate profile, `AiProvider` port + Claude adapter + fake, `ai_calls` log, daily budget guard, `ScorePosting`, promptfoo evals.
Out: answer drafting, RAG, SQS/async scoring (sync `POST` now, queue behind a port in SDD-005), dashboard, auto-scoring on ingest, multi-profile.

## Tasks
One PR each, small Conventional Commits.

| # | Task | Content | Verifiable output |
|---|---|---|---|
| T1 | Profile & criteria | Domain, `GetProfile`/`SaveProfile`, `GET`/`PUT /profile`, migration | Unit + Supertest |
| T2 | AI port, Claude adapter, metering & budget | `AiProvider`, `AnthropicAiProvider`, `FakeAiProvider`, `MeteredAiProvider`, `ai_calls`, `GET /ai/usage` | Unit + Supertest with the fake; one approved live smoke call |
| T3 | Posting scoring | `ScorePosting`, `posting_scores`, `POST`/`GET /postings/:id/score` | Unit + Supertest with the fake |
| T4 | Evals & closing | Labelled dataset, promptfoo config, `pnpm eval`, README, LOG | Eval report meets thresholds |

## Domain model
- `CandidateProfile { stack: string[], seniority: junior|mid|senior|lead, allowedLocations: string[] (ISO country codes, or `worldwide`/`latam`), maxEnglishLevel: A1..C2, excludedContractTypes: (temporary|freelance|internship|part_time)[], summary: string, version: int, updatedAt }`. Single row; `version` increments on every save.
- `PostingScore { id, postingId, verdict: fit|maybe|reject, reasons: string[], blockers: Blocker[], profileVersion, promptVersion, model, aiCallId, createdAt }`. UI maps fit/maybe/reject to ✅/⚠️/❌.
- `Blocker { type: location|english|seniority|contract|stack|other, evidence: string }` (quote or paraphrase from the posting).
- `AiCall { id, purpose, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, latencyMs, costUsd, status: ok|error|refused|budget_blocked, createdAt }`.
- **Invariant (domain, not prompt):** any blocker forces `reject`; `fit` requires zero blockers. The model's verdict is corrected if it violates this, so a manipulated posting cannot talk its way into a ✅.

## Ports & adapters
- `AiProvider.generateStructured<T>({ purpose, system, content, schema: ZodType<T> }) → { data: T, usage, model }`. Errors: `AiRefusalError`, `AiNotConfiguredError`, `AiProviderError`. No SDK types cross the port.
- `AiCallRepository { save(call), spentSince(date) }`, `ProfileRepository { get(), save(p) }`, `PostingScoreRepository { save(s), findLatest(postingId) }`; Prisma + in-memory adapters.
- `MeteredAiProvider` (application layer) decorates any `AiProvider`: refuses when today's spend ≥ budget (`BudgetExceededError`, logged as `budget_blocked`), measures latency, logs every call including failures. Future providers get metering for free.
- `AnthropicAiProvider` (infrastructure): `@anthropic-ai/sdk`, model from `AI_MODEL` (default `claude-sonnet-5-5`), structured output via `output_config.format` built from the Zod schema (no forced tool choice: rejected by these models), adaptive thinking, `effort: medium` (tuned in T4), server-side `fallbacks: "default"`, refusal handling, cost computed from `usage` with a dated price table in the adapter. System prompt + profile are the cached prefix; the posting is the volatile tail.

## API contract
Schemas in `packages/shared`.
- `GET /profile` → 200 | 404 if never saved. `PUT /profile` → 200 (upsert, `version+1`), 400 invalid.
- `POST /postings/:id/score` → 201 with the score (each call adds a row; history is kept). 404 unknown posting · 422 `profile_not_configured` or `ai_refused` · 429 `ai_budget_exceeded` · 502 `ai_provider_error` · 503 `ai_not_configured` (no API key).
- `GET /postings/:id/score` → latest score, 404 if none.
- `GET /ai/usage` → `{ date (UTC), spentUsd, budgetUsd, calls, inputTokens, outputTokens }` for today.

## Data changes
Prisma migrations (generated, never hand-edited): `candidate_profiles` (singleton), `posting_scores` (FK `postings`, index `(postingId, createdAt)`), `ai_calls` (`costUsd` Decimal(10,6), index `createdAt`). Env: `AI_MODEL`, `AI_DAILY_BUDGET_USD` (exists); `ANTHROPIC_API_KEY` stays optional so the API boots without it. The budget day is the UTC day.

## Test plan
- Unit (in-memory + fake): profile save/version; `MeteredAiProvider` (logs ok/error/refused, blocks over budget, day boundary); `ScorePosting` (missing posting/profile, invariant correction, stores profile/prompt versions, refusal propagates); cost calculation incl. cache tokens.
- Adapter: `AnthropicAiProvider` against a stubbed SDK client (request shape, usage → cost, refusal, API errors → typed errors).
- Integration (Supertest, Postgres, fake provider): every status code above, `/ai/usage` totals.
- Live smoke (opt-in, `RUN_LIVE_AI=1`, excluded from `pnpm quality` and CI): one real call.
- Evals (`pnpm eval`, promptfoo, not in CI): ≥30 labelled postings (mix of ES/EN, real anonymized + synthetic), thresholds: verdict accuracy ≥85%, hard-blocker recall ≥90%, 0 `fit` on postings labelled `reject`; cost and latency reported.

## Acceptance criteria
- `PUT /profile` then `POST /postings/:id/score` returns a stored score with reasons and blockers; every AI call has a row in `ai_calls` with tokens, latency and cost.
- Over the daily budget, scoring returns 429 and makes no provider call.
- `pnpm quality` passes without network or API key; domain/application import no SDK.
- Eval thresholds met on the chosen model; result recorded in `docs/decisions/LOG.md`.

## Risks
- **Prompt injection** via posting text: posting passed as delimited data; verdict invariant enforced in domain; output limited to a closed schema.
- **Spend:** real calls cost money; live smoke and each eval run need explicit approval; budget guard defaults to 1 USD/day. Sonnet 5.5 ≈ 0.008 USD per posting (estimate; verified with `ai_calls`).
- **Refusals/outages:** fallback enabled, 422/502 instead of 500.
- **Stale prices:** price table is dated; revisit when the model changes.
- **Non-deterministic evals:** thresholds, not exact matches; dataset needs ~10 real postings from the user.
- **Race on budget:** concurrent calls can overshoot slightly; acceptable for a single user (documented).
