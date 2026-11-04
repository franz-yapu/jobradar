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

## 2026-11-02 – SDD-002 design choices
- **Model:** default `claude-sonnet-5-5`, configurable via `AI_MODEL`; evals decide whether `claude-haiku-5-5` is enough. Estimated ~0.008 USD per posting vs ~0.016 (Opus 5.5) and ~0.0004 (Haiku 5.5).
- **Structured output instead of forced tool use:** Opus/Sonnet 5.5 reject forced `tool_choice` and cannot disable thinking, so scoring uses `output_config.format` with the shared Zod schema.
- **Sync scoring first:** `POST /postings/:id/score`; the queue (SQS) goes behind a port in SDD-005.
- **Profile in SDD-002:** PRD feature 2 had no SDD; it is T1 here. Answer drafting and RAG move to a later SDD that reuses `AiProvider`.

## 2026-11-03 – Groq adapter for trial runs (SDD-002 T4)
- **Decision:** add `GroqAiProvider` behind the `AiProvider` port, selected with `AI_PROVIDER=groq` (+ `GROQ_API_KEY`, default model `openai/gpt-oss-20b`). Anthropic stays the default and the production target.
- **Why:** the only key available for testing the eval pipeline end to end was a Groq key. The port exists for this; no use case changed, metering and the daily budget apply unchanged.
- **How:** OpenAI-compatible chat API over `fetch` (no new dependency), JSON mode with the JSON Schema in the system prompt, answer re-validated with Zod. JSON mode is used instead of `json_schema` because not every Groq model supports the latter.
- **Caveat:** eval results from a Groq model do not validate `claude-sonnet-5-5`; thresholds must be re-checked on the production model before closing SDD-002. Groq prices in `pricing.ts` carry the same dated-table caveat.

## 2026-11-03 – First eval runs (SDD-002 T4): thresholds NOT yet met
- **Setup:** 32 synthetic postings (7 fit / 6 maybe / 19 reject; ES+EN; 2 prompt-injection cases), model `openai/gpt-oss-20b` on Groq, `temperature: 0`. Model is a trial stand-in: **these numbers do not validate `claude-sonnet-5-5`**.
- **Results** (accuracy / blocker recall / unsafe fits / cost per run):

  | Prompt | Accuracy | Recall | Unsafe fits | Cost |
  |---|---|---|---|---|
  | score-v1 | 71.9% | 84.2% | 3 | 0.0063 USD |
  | score-v2 | 84.4% | 100% | 0 | 0.0058 USD |
  | score-v3 | 84.4% | 100% | 0 | 0.0062 USD |

  Thresholds: accuracy >= 85%, recall >= 90%, unsafe fits = 0. Recall and safety pass since v2; accuracy is one case short (27/32).
- **What the evals found:** v1 never defined `allowedLocations`, so `worldwide` was read as "can work anywhere" and US-only / on-site Madrid / EU-only postings got `fit` (fixed in v2). v2 blocked a role for a missing secondary tool (Docker; fixed in v3). The small model sometimes omits the `blockers` key (1 error per run, different case each time).
- **Open:** (1) 3 `maybe` cases (`mid-senior-range`, `heavy-devops`, `exceptional-remote`) are debatable labels; the owner should confirm them, labels are not tuned to the model. (2) Re-run on the production model (needs `ANTHROPIC_API_KEY`) before closing SDD-002; consider `gpt-oss-120b` meanwhile. (3) ~~Retry once on a schema mismatch~~: done in `GroqAiProvider` (both attempts are billed and logged as one call; truncation, HTTP and network errors are not retried). (4) Add ~10 real anonymized postings.
- **Run notes:** a full run takes ~6.5 min because of Groq rate limits; one call took 62 s.

## 2026-11-03 – Eval profile is now a selectable file, set to the owner's real stack
- **Decision:** the eval profile moved from an inline block to `apps/api/evals/profiles/*.json` (default `franz.json`, built from the owner's CV; alternative `example.json`). The provider validates it with `SaveProfileSchema`, like `PUT /profile`.
- **Why:** the first three runs (table above) used a generic stand-in (TypeScript/NestJS/React/PostgreSQL/AWS), not the real stack (Angular first, Fastify/NestJS + Prisma + PostgreSQL, AWS only conceptual, English B1-B2 modelled as B2).
- **Consequence:** the v1-v3 numbers belong to the generic profile and are not comparable one-to-one with future runs. The 32 labels were kept as they are on the owner's instruction; the next run is the baseline for `franz.json`.
- **Open:** CV says English B1-B2; try `B1` in the profile to see which fit labels depend on it.

## 2026-11-03 – Eval baseline with the owner's profile (`franz.json`, score-v3, Groq retry on)
- **Result:** accuracy 84.4% (27/32), blocker recall 100%, unsafe fits 0, 0 errors (the retry removed the missing-`blockers` failures), 0.0061 USD per run, mean 1.3 s. Same accuracy as the generic profile, so thresholds are still NOT met by one case.
- **Misses:** `fit-es-backend-aws-servicios` answered `reject` (stack blocker on SQS/Lambda; AWS is only conceptual in the CV, so the `fit` label is itself debatable with this profile) and four `maybe` labels answered `fit`. Labels were left untouched on the owner's instruction.
- **Reading:** `gpt-oss-20b` almost never answers `maybe`; recall and safety are solid, the middle class is where it is weak. 32 cases and one-case swings (3.1 points) make 84.4% vs 85% statistically indistinguishable.
- **Next:** run on the production model (`claude-sonnet-5-5`, needs `ANTHROPIC_API_KEY`); optionally `gpt-oss-120b` first. Owner to decide whether `fit-es-backend-aws-servicios` should be `fit` or `maybe` given AWS is conceptual.

## 2026-11-03 – SDD-003 n8n workflows: what the real data changed
- **Source:** Get on Board public API (`/api/v0/categories/programming/jobs`), not RSS (none found). Rate limits and terms were not readable (their reference page renders client-side); usage is low (5 requests per 6 h, identified by `User-Agent`). The owner should read `getonbrd.com/about/tos`.
- **Not sorted by date:** the list is not ordered by `published_at`, so no early stop: every run reads 5 pages of 100 (the API accepts `per_page=100`; ~330 programming jobs) and keeps those from the last 48 h.
- **`remote_local`:** real value meaning "remote, only for residents of some country" (the country is only exposed as ids or inside the text). Mapped to `country` with a `location` note, instead of the `onsite` first assumed in the SDD. `fully_remote` with `countries: ["Remote"]` stays `unknown`: the AI decides.
- **n8n quirks found while verifying:** imports need an `id`; `$(node).all()` inside a loop only returns the last iteration (the run summary walks every run); `n8n execute` inside the container needs `N8N_RUNNERS_BROKER_PORT` to avoid a port clash; n8n 2.x blocks `$env` unless `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- **Verified live** (n8n 2.40.5, Groq `openai/gpt-oss-20b`, throwaway `jobradar_test` DB): 16 postings created, exactly 3 scored with the cap lowered to 3 (0.0009 USD); re-run created nothing and scored nothing; with the budget spent the first score answered `429`, scoring stopped and the run still succeeded; daily summary built the expected message and fails loudly when the API is down.
- **Not verified:** the actual Telegram delivery (needs the owner's bot token and chat id) and a schedule firing on its own.

## 2026-11-04 – SDD-003 verified live with the owner's Telegram bot
- **Telegram:** the daily summary was delivered to the owner's chat from n8n (credential `JobRadar Telegram bot` created from the token in `.env`, chat id in `TELEGRAM_CHAT_ID`). The token stays in `.env` (git-ignored) and in n8n's encrypted credential store.
- **First real collect against the dev DB:** 29 postings stored, only 3 scored. Groq's free tier allows 8000 tokens per minute for `openai/gpt-oss-20b`; 17 of 20 calls failed with a rate-limit error (logged in `ai_calls`, ~0.001 USD).
- **Known gap:** workflow 1 only scores postings it just created, so the unscored ones are not retried, and it keeps calling the API after a rate-limit `502`. Accepted for now by the owner; fix = retry unscored postings and pause on provider rate limits (small follow-up, not scheduled).

## 2026-11-04 – SDD-004 T1: web skeleton
- **Stack:** React 19, Vite 8, TanStack Query, React Router, Tailwind 4, `react-i18next`; Vitest + Testing Library in jsdom. Shared Zod schemas are imported straight from `@jobradar/shared`.
- **Single API module:** `apps/web/src/api/client.ts` validates every response and maps errors to `ApiError` (status + machine code) / `ContractError`; this is where the auth token will go (SDD-006).
- **Dev without CORS:** the Vite dev server proxies `/api` to the API. CORS is still configured in the API (`WEB_ORIGIN`, comma separated, no wildcard) for deployed builds, with an integration test.
- **"Translator":** UI translation through two dictionaries, switched live, saved in `localStorage` (blocked storage is tolerated); a test enforces identical keys. Translating posting text with AI is out of scope.
- **Scope split:** CV import (PDF to profile, SDD-005) and accounts / SaaS (SDD-006, needs a PRD update and an ADR because the PRD excludes multi-user) are separate SDDs; AWS deploy becomes SDD-007.

## 2026-11-04 – SDD-004 T2: postings screen and manual paste
- **Filters in the URL** (`verdict`, `q`, `source`, `since`, `page`), parsed defensively (unknown values ignored); "stored since" is relative (24 h / 7 d) and converted to `createdSince` at query time.
- **Manual paste:** only the text is required. Without a link the identity is `manual:<sha-256 of the text, whitespace-collapsed and lowercased>`; the API accepts that form (shared `ManualUrlSchema`, `normalizeUrl` keeps it as is), so pasting the same text twice gives `409`. Title defaults to the first line, company to `—`. Such postings show no external link and are labelled "pasted by hand".
- **Scoring errors** are translated by machine code (`ai_budget_exceeded`, `ai_not_configured`, `profile_not_configured`, `ai_refused`, `ai_provider_error`).
- **Not done yet (T3):** profile screen and the Playwright E2E.

## 2026-11-04 – SDD-004 T3: profile screen and E2E
- **Profile screen:** edits every field of the current profile (stack and locations as chips, locations normalized to `BO` / `latam` / `worldwide`, validated with the shared `SaveProfileSchema` before sending). CV import will extend it in SDD-005.
- **E2E (Playwright, one ordered scenario):** save profile, paste two postings, score one on paste and one from the list, duplicate paste, verdict filter in the URL, live switch to Spanish that survives a reload. It runs the real API and database with a `DeterministicAiProvider` (a posting mentioning `C2` is rejected, anything else is a fit), on ports 3100 / 5174.
- **Safety:** the E2E API empties its database, so `apps/api/e2e/server.ts` refuses to start unless the database name ends in `_test` or `_e2e`.
- **CI:** a separate `e2e` job (Postgres service, Chromium installed) so `pnpm quality` needs no browser download.
- **Stable test hook:** the verdict badge has `data-testid="verdict"` because its text is mixed with an icon and exact-text locators did not match.

## 2026-11-04 – SDD-005 T1: CV import backend
- **Draft, not save:** `POST /profile/import-cv` returns a `CvDraft` (profile shape plus `warnings`) and stores nothing; the candidate completes it and saves through `PUT /profile`. The draft schema is lenient (empty stack / locations allowed) because a CV may not say them.
- **Warnings are codes** (`no_stack`, `location_missing`, `seniority_estimated`, `seniority_missing`, `english_level_missing`, `no_experience`, `no_education`, `text_truncated`), not sentences, so the UI can translate them. Amends the SDD wording (`string[]`). A test keeps the domain list equal to the shared one.
- **Extraction is deliberately simple for the model:** nullable fields, no length limits, no field for name, email or phone. The use case does the strictness: clamps lengths and years, drops incomplete entries, derives seniority from years (<2 junior, <5 mid, <9 senior, else lead), takes the country as the only allowed location, defaults English to B1 with a warning, and scrubs emails, phone numbers (9+ digits, so year ranges survive) and LinkedIn/GitHub links from free text.
- **PDF reading:** `pdf-parse` behind the `CvTextExtractor` port; the type is checked by content (`%PDF-`), pages are joined by us (the library's own joiner adds "-- 1 of 2 --" markers), more than 15 pages or no text layer are refused before any AI call. Text sent to the model is capped at 30 000 characters.
- **Storage:** `candidate_profiles` gets `education`, `experience`, `languages` (Json, default `[]`) and `certifications` (text[]); the existing dev profile migrated untouched. The Prisma adapter validates the JSON with the shared Zod schemas when reading.
- **Web safety net:** the profile screen carries the imported background along when saving, so editing the criteria never wipes it (its own editor arrives in T3).
- **Tests:** PDFs are generated in the tests (`test/helpers/make-pdf.ts`); no real AI call.
