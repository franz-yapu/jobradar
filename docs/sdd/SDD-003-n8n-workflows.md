# SDD-003 – n8n workflows: collect postings and daily Telegram summary

**Status:** Approved (2026-11-03) · **Week:** 3 · **Depends on:** SDD-001, SDD-002

## Context
Postings only enter by hand and nothing triggers scoring or tells the candidate what was found. PRD features 1 (ingest from n8n) and 6 (daily notification) are covered here. The ticket said "RSS from Get on Board"; no RSS was found, but Get on Board has an official **public API** (no login). Verified with real requests on 2026-11-03: `GET https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=N&page=P&expand=["company"]` → `{ data: [job], meta: { page, per_page, total_pages } }`. The technical reference (`api-doc.getonbrd.com`) could not be read, so rate limits and terms of use are **not confirmed** (see Risks).

## Goal
Every few hours new Get on Board programming postings are stored and scored automatically; every morning the candidate receives a Telegram summary of what was found in the last 24 h.

## Scope
In: `GET /postings` with verdict, `createdSince` and the latest score; workflow 1 (collect + score); workflow 2 (daily summary); a pure mapper with a saved real fixture; `docker-compose` fixes for n8n; JSON validation test; README section.
Out: SQS/async scoring (SDD-005), dashboard (SDD-004), other sources, email channel, re-scoring old postings, answer drafting, Telegram replies/commands.

## Tasks
| # | Task | Content | Verification |
|---|---|---|---|
| T1 | Listing with verdicts | `GET /postings?verdict=&createdSince=` + `latestScore` | Unit + Supertest |
| T2 | Workflow 1 | Mapper, fixture, workflow JSON, compose, validation test | Tests + manual run on local n8n |
| T3 | Workflow 2 + docs | Daily summary, Telegram, README, LOG | Manual run with the owner's bot |

## Domain model
- `LatestScore { verdict: fit|maybe|reject, reasons: string[], blockers: Blocker[], scoredAt: Date }`: read-only view of the newest `posting_scores` row (order `createdAt desc, id desc`). `Posting` itself does not change.
- `PostingListItem = Posting + latestScore: LatestScore | null`. `null` means not scored yet.
- **Get on Board → `NewPosting` mapping (pure function, in `n8n/code/map-job.js`):**
  - `title` ← `attributes.title`; `company` ← `attributes.company.data.attributes.name`; `url` ← `links.public_url`; `source` = `"getonboard"`; `publishedAt` ← `published_at` (Unix seconds) as ISO.
  - `description` ← sections joined with their headlines (`projects`, `functions_headline`+`functions`, `description_headline`+`description`, `desirable…`, `benefits…`), HTML stripped to text, cut at 12 000 chars (bounds AI cost).
  - `location` ← `countries` joined (plus `remote_zone` if present).
  - `remoteScope` (amended in T2 after reading real responses; observed `remote_modality`: `fully_remote`, `remote_local`, `hybrid`, `no_remote`): `hybrid`/`no_remote` → `onsite`; `remote_local` (remote only for residents of some country; the country is only exposed as ids or free text) → `country`, with `location` saying so; `fully_remote` with a zone containing "latam" → `latam`, with one named country → `country`, otherwise `unknown`. Never guess `worldwide`: when unsure the AI decides from the text.

## Ports & adapters
- `PostingRepository.list(filter)` returns `PostingListItem`s and accepts `verdict` (`fit|maybe|reject|unscored`, applied to the **latest** score) and `createdSince`. The Prisma adapter joins `posting_scores` (infrastructure only); the in-memory adapter gets a test helper to attach scores.
- Workflows talk to the API only over HTTP (no direct DB access). Secrets live in n8n credentials / env, never in the exported JSON.
- **Workflow 1** (cron every 6 h): fetch up to 5 pages of 100 programming jobs (amended in T2: the API does not sort by date, so there is no early stop) and keep those published in the last 48 h → map → `POST /postings` (`409` = already known, ignored) → score the **new** ones sequentially with a cap of **20 per run** → stop scoring on `429` (budget) and log it. Unscored postings appear as "unscored" in the summary.
- **Workflow 2** (cron 08:00 `America/La_Paz`): `GET /postings?createdSince=<now-24h>&pageSize=100` (paginated) → counts per verdict + unscored → Telegram message: counts, the ✅ list (title, company, link, first reason) and the number of ⚠️. Empty day → one short "no new postings" message.
- Compose: `extra_hosts: host.docker.internal:host-gateway` so n8n reaches the host API; `JOBRADAR_API_URL` env; `GENERIC_TIMEZONE`/`TZ=America/La_Paz`; `WEBHOOK_URL` follows `N8N_PORT`; **pin the n8n image** to a tested version.

## API contract
Schemas in `packages/shared` (`PostingListItemSchema = PostingSchema.extend({ latestScore })`).
- `GET /postings?source=&q=&verdict=&createdSince=&page=&pageSize=` → 200 `{ items: PostingListItem[], page, pageSize, total }`; 400 invalid `verdict` or non-ISO `createdSince`. Existing params and ordering (newest first) unchanged; `POST /postings` response unchanged.

## Data changes
None (no migration). The index `posting_scores(postingId, createdAt)` from SDD-002 already serves the latest-score lookup.

## Test plan
- Unit (in-memory): list filters `verdict` on the latest score only (an old `fit` superseded by a `reject` does not match), `unscored`, `createdSince`, combination with `source`/`q`/paging.
- Integration (Supertest, Postgres, fake AI): the same through HTTP + 400 cases; `latestScore` shape.
- Mapper: runs `map-job.js` over `n8n/fixtures/getonboard-jobs.json` (trimmed real response) and validates every result with `CreatePostingSchema`; cases for hybrid, LatAm zone, single country, missing company, HTML stripping, length cap.
- Workflow JSON test (`pnpm test`): valid JSON, allowed node types, connections point to existing nodes, no secrets (Telegram token pattern, `gsk_`, API keys), the embedded Code node equals `map-job.js`.
- Manual (T2/T3): import into n8n on port 5679, run workflow 1 against the live API with the Groq provider, run workflow 2 with the owner's Telegram bot; screenshots for the README. Needs the bot token and chat id from the owner (never committed).

## Acceptance criteria
- Running workflow 1 twice creates postings once (second run only gets `409`s) and scores at most 20 new ones; a `429` stops scoring without failing the run.
- Workflow 2 delivers a Telegram message whose counts match `GET /postings?createdSince=…`.
- `pnpm quality` passes without network or n8n; exported JSON contains no secrets; compose starts n8n with a pinned image and reaches the API from the container.

## Risks
- **Unconfirmed API terms/limits:** only the official public API is used, identified with a `User-Agent`, at low volume (≤5 pages per run, every 6 h); the owner should read Get on Board's terms (`/about/tos`) before leaving it running.
- **API shape drift:** the mapper is isolated and tested against a saved real response; failures show up as `400`s from `POST /postings`, logged per item.
- **Spend and slowness:** Groq rate limits made evals slow (~10 s per scored posting); the cap, sequential calls and the daily budget bound cost; runs may take minutes.
- **Env access in n8n:** recent n8n versions can block `$env` in nodes; the chat id may need `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` or an n8n variable (decided at T3).
- **`remoteScope` is conservative:** many postings stay `unknown`; scoring quality depends on the description text and the model.
- **Non-deterministic verdicts** (small model): the summary shows the verdict at scoring time; re-scoring is manual.
