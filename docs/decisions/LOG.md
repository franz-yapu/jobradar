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

## 2026-11-04 – SDD-005 T2: admin-style interface
- **Look and feel only:** sidebar, top bar with breadcrumb, white cards on a light grey page, soft shadows, rounded controls and a single blue accent, in the style of admin templates such as Metronic. No code, icons or images from that (licensed) template: the components are ours (`components/ui.tsx`, `icons.tsx`).
- **Tokens:** colours, shadows and the font stack are CSS variables in `styles.css`, exposed to Tailwind through `@theme inline` (`bg-card`, `text-muted`, `border-line`, `bg-primary`...). Dark mode follows the system and only swaps the variables.
- **Shell:** fixed sidebar on large screens, collapsible to icons (choice remembered in `localStorage`, labels stay for screen readers), drawer on phones (closes with Escape, on backdrop press or after choosing a link). Skip-to-content link, `aria-current` on the active page, visible keyboard focus.
- **Pages:** postings are one card with a divided list (stacked on phones), filters in their own card, profile split into "Search criteria" and "Summary" cards. Behaviour, accessible names and test ids are unchanged, so the E2E needed no edits.
- **No nested interactive elements:** the "Paste a posting" call to action is a link styled as a button (`buttonClass`), not a button inside a link, and its text differs from the sidebar's "Add posting" so both stay unambiguous for assistive tech and tests.
- **Checked by screenshot** (desktop, collapsed, phone, drawer, dark): it caught a cramped row layout on phones, fixed before committing.

## 2026-11-04 – SDD-005 T3: CV upload and background editors in the dashboard
- **Flow:** the profile screen has an "Import from your CV" card (PDF picker, "Read my CV"). The draft fills the whole form, a banner says it is unsaved and lists the import's warnings (each code translated in EN/ES), and "Discard draft" restores the saved profile. Saving goes through the normal `PUT /profile`; a draft with no location is refused client-side like any incomplete profile.
- **Privacy notice before upload:** the card states that the CV text goes to the configured AI provider and that name, email and phone are never requested or stored.
- **Cheap checks before uploading** (type and 5 MB), the API still checks by content; failures show translated messages (not a PDF, too large, no text, too many pages, AI errors).
- **Editors:** experience (with "current job" disabling the end year and up to 5 highlights, one per line), education, languages and certifications (chips), all editable by hand too. Blank rows are dropped when saving (`toSaveBody`), a current job never sends an end year.
- **Client:** `importCv` sends `multipart/form-data`; the JSON content type is now set only for string bodies so the browser adds the multipart boundary.
- **Checked by screenshot** with a mocked import (desktop and phone).
- **Not run for real yet:** no real CV was sent to Groq; the owner is asked first (cents).

## 2026-11-04 – SDD-005 T4: scoring uses the CV background (score-v4)
- **Prompt:** profiles with a background (experience, education, languages, certifications) get an extra `background` section in the system prompt (jobs with company, role, years and at most 2 highlights of 200 characters each; studies; languages; certifications) and a short instruction: it is evidence of skills and seniority, never invented, never overrides `maxEnglishLevel` or the other criteria, and a missing degree is a reason to mention, not a blocker. CV text stays inside the JSON (escaped), so it cannot read as instructions.
- **Same prompt for profiles without background:** the text is byte-for-byte the score-v3 prompt, so the earlier eval numbers still describe them (`franz.json` has no background). Only the stored `promptVersion` changes to `score-v4`.
- **Evals not re-run:** with the evals' profile the prompt did not change, so a re-run would measure Groq's noise, not this change. A run with a CV-based profile is the meaningful one; it needs the owner's OK (about 0.006 USD) and a labelled dataset for that profile.
- **E2E:** a second scenario imports a PDF generated in the test (the API reads it for real, the AI is the deterministic fake), checks the privacy notice, the draft banner and warnings, that saving is refused until a country is added, that the data is stored (survives a reload) and that a draft can be discarded. The fake AI answers CV extraction with a fixed result that has no country on purpose.
- **Still pending from the owner:** try the import with the real CV (Groq, cents).

## 2026-11-04 – SDD-006 T1: accounts backend (ADR-0002)
- **Done:** `users` and `sessions` tables; register / login / logout / me; global `AuthGuard` (everything protected unless `@Public()`: health, register, login, logout; `/docs` is served by Swagger outside Nest); `OriginGuard`; in-memory attempt limiter behind a port; scrypt hasher (N=2^16, r=8, p=2, parameters stored in the hash, NFKC-normalized password, bounded cost on verify); 256-bit session tokens, only their SHA-256 stored; sessions last 14 days and are renewed at most once a day.
- **Details decided while building:** logout is public so it can clear an expired cookie; unknown-email login verifies against a dummy hash (same time, same answer); `register` is limited to 20 per address per hour and every attempt counts; `Origin` check applies to every write (also login/register) and is skipped when there is no `Origin` or the request uses a Bearer token (ready for T3).
- **Cheap hashing under Vitest only** (`NODE_ENV=test`, N=2^10): the strong setting takes ~0.15 s per hash; every other run uses the strong one. A test pins the production parameters.
- **Tests:** 28 unit (use cases with in-memory adapters, hasher, limiter, tokens) and 27 integration (cookie flags, nothing secret in responses, only hashes stored, same answer for unknown email / wrong password, server-side logout, 429 + Retry-After, expired session, 401 on every protected route, Origin check, signup disabled). Existing integration tests now log in through `test/helpers/auth.ts`.
- **Known intermediate state:** from this commit every endpoint needs a session, but the dashboard has no login yet (T4), the n8n workflows have no token yet (T3) and data is not per-account yet (T2). The web app and `pnpm e2e` do not work between T1 and T4.
- **Safety copy:** the dev database was dumped before the first migration of this SDD (kept outside the repo).

## 2026-11-04 – SDD-006 T2: data belongs to an account
- **Schema:** nullable `userId` (FK to `users`, `ON DELETE CASCADE`) on `postings`, `candidate_profiles`, `posting_scores` and `ai_calls`; `postings.url` unique became unique `(userId, url)`; the profile is one row per user (`userId` unique). Nullable only for rows that predate accounts: the domain always sets it. Migration generated with `prisma migrate diff` (the interactive `migrate dev` refused to run non-interactively because it drops an index) and applied with `migrate deploy`; the dev database was dumped first.
- **Scoping in the repositories, not in the controllers:** every port method now takes `userId` first (`findById(userId, id)`, `list(userId, filter)`, `ProfileRepository.get(userId)`, `totalsSince(userId, since)`...), so forgetting a filter is a type error. A posting of another account is simply "not found" (`404`). The latest-score SQL (`LEFT JOIN LATERAL`) filters scores and postings by owner too. `userId` never appears in API responses.
- **AI per account:** `GenerateStructuredRequest` carries `userId`; `MeteredAiProvider` budgets and logs per account; `GET /ai/usage` shows the caller's spend. The evals call the raw provider with a placeholder owner.
- **Adoption:** `PrismaUserRepository.create` runs in one transaction with an advisory lock; if there were no users it hands every ownerless row (postings, profile, scores, AI calls) to the new account. A failed registration (weak password, duplicate email) adopts nothing; five simultaneous first registrations still give the data to exactly one account.
- **Rehearsed on a copy of the real dev data** (throwaway database, dropped afterwards): the first account saw all 29 postings, the real profile and 34 AI calls; no ownerless rows were left.
- **Tests:** an isolation suite with two real accounts (lists, totals, search and filters, same URL in both, score endpoints answer 404 and never reach the AI, scores built with the owner's profile, CV import and budget per account, ownership in the database, cascade on delete), an adoption suite, and unit tests of each scoped repository.
- **Still true:** the dashboard has no login yet (T4) and the n8n workflows have no token (T3).

## 2026-11-04 – SDD-006 T3: API tokens and n8n with a token
- **Tokens:** `jr_` + 256 random bits; only the SHA-256 is stored; the secret is returned once at creation; the list shows a prefix, dates and revocation. At most 10 active per account; revoking is immediate, idempotent, and another account's token is `404`. `lastUsedAt` is refreshed at most once a minute.
- **Guard:** a `Bearer` header wins over the cookie and a bad token is a `401`, never a silent fallback to a valid cookie. Token requests are exempt from the Origin check (they do not use the cookie).
- **A token cannot manage tokens:** `/auth/tokens` is `@SessionOnly()` (`403 session_required` with a token), so a leaked n8n token cannot mint a replacement that outlives its own revocation.
- **n8n:** the three calls to the JobRadar API send `Authorization: Bearer {{ $env.JOBRADAR_API_TOKEN }}`; the Get on Board call never does (a test enforces both, and that no literal token is in the JSON). The collect workflow now throws on a `401` instead of reporting "nothing new" (it used to swallow it because the create call ignores error statuses). `docker-compose.yml` passes `JOBRADAR_API_TOKEN` to the container.
- **Verified live** in a disposable n8n container (not the owner's) against a throwaway API and database: with a valid token the collect workflow created 27 postings owned by the account and reached scoring (the AI budget was 0, so it stopped at the budget `429`, no AI spend); with a wrong token the run failed with the explicit "rejected the API token" error.
- **The owner's running n8n still has the old workflows** (no token). Once the owner's account exists: create a token, set `JOBRADAR_API_TOKEN` in `.env`, `docker compose up -d n8n`, re-import both workflows and activate them again.

## 2026-11-04 – SDD-006 T4: accounts in the dashboard
- **Session handling in the browser:** the API client sends the cookie with every call (`credentials: "include"`) and never sees a token. `AuthProvider` asks `GET /auth/me` once (a 401 there means "nobody logged in", not an error). `RequireAuth` wraps every protected route and sends anonymous visitors to `/login`, remembering the page they asked for (only local paths are accepted as a return address, so a crafted link cannot bounce the user to another site).
- **Lost session:** a protected call that answers 401 triggers a global handler that drops every cached answer and returns to the login screen. Login, registration and logout (and `/auth/me`) are excluded: for them a 401 is an expected answer.
- **No cross-account leaks in the cache:** on any change of account (login, registration, logout, lost session) all queries except "who am I" are removed. A first version used `queryClient.clear()`, which also wiped the in-flight login mutation and left the form stuck on "Logging in…"; it now removes only queries.
- **Logout cannot trap the user:** if the server call fails, the browser still forgets the account (the cookie is httpOnly and expires by itself).
- **Screens:** login, registration (repeat password, checked client side before sending), API tokens (create, secret shown once with a copy button and a "store it as JOBRADAR_API_TOKEN" hint, list with prefix/dates/status, two-step revoke), user email and "Log out" in the header, a sidebar entry for the tokens; all in EN/ES with translated server errors (wrong credentials, too many attempts, email taken, closed registration, token limit, ended session).
- **Checked by screenshot** (login, register in dark mode, tokens with a freshly created secret, phone in Spanish).
- **Known gap until T5:** `pnpm e2e` still describes the app without a login and fails; T5 rewrites it with two accounts.

## 2026-11-04 – SDD-006 T5: two-account E2E and security review
- **E2E cleanup:** the E2E API also deletes `users` (sessions and API tokens cascade), so every run starts with no account and the first registration cannot adopt rows left by the previous run.
- **Four ordered Playwright tests, one fresh browser context each:** an anonymous visitor asking for `/profile` is sent to `/login`; account A saves a profile, pastes and scores postings, filters, switches EN/ES and survives a reload; account B registers, sees an empty list and no profile, and account A logs back in to find its data untouched; then account A imports a CV (the existing import scenario, now behind the login).
- **Login helpers do not assume the landing page:** after logging in, the app returns to whatever page sent the user to the login screen, so the tests only wait for the header's "Log out" button and navigate explicitly.
- **Security review** written in `docs/security-review.md` (checklist plus residual risks): scrypt parameters, hashed sessions/tokens, CSRF via `SameSite=Lax` + `OriginGuard`, no login enumeration, per-account scoping in the repositories, token secrets shown once, cache isolation in the browser, and the checks that already have tests. The open items are deployment-time work: shared throttle for several instances, trusted proxy IPs, security headers at the proxy/CDN, and deciding whether Swagger stays public.
- **Verified:** `pnpm e2e` (4 tests) and `pnpm quality` (334 API + 111 web + 28 shared tests) pass.

## 2026-11-04 – Green matte interface with light and dark themes (design-taste-frontend, app-screen rules)
- **Style:** `achromatic-ledger` (a working tool, one person, long sessions) with the user's explicit request layered on top: a single matte forest/sage green is the one hue, used on the primary action, the active nav item, links, focus and the "fit" verdict (a 3px green edge on the row and a green pill); everything else is a green-tinted neutral. This deliberately departs from the style's "near-black primary, no brand colour in the chrome" because the owner asked for green to predominate.
- **Face (what makes it this product's):** a sage ground in place of the kit's #f8f8f8, the radar mark in green, Geist loaded for real (`@fontsource-variable`, bundled, no network call) with tabular figures everywhere, and the verdict as the only coloured data. No emoji: status is a pale tint, dark text of the same hue and a 6px dot.
- **Matte:** low-chroma greens and earthy status tints (ochre for "maybe", clay for "reject"); no gradients, no blur, no shadow at rest (borders and tone steps instead), tight radii (8 cards, 6 controls); the header is opaque.
- **Themes:** light, dark, or system, switchable by a radio group in every header (also on login and register). `data-theme` on `<html>` forces one; with none, `prefers-color-scheme` decides and follows the system live. The saved choice is applied by a tiny script in `index.html` before the first paint (no white flash), and `theme-color` meta tags match both grounds. Dark is a near-black with a green cast, not navy or slate.
- **Contrast checked, not guessed:** every text pair reaches at least 4.5:1 in both themes (body 14:1+, muted 5.2-7.1, button label 5.6-6.2, the four verdict pills 6.7-8.1). White on the dark theme's danger button measured 3.9, so danger has its own `on-danger` text colour.
- **Web Interface Guidelines review applied:** one h1 per page with h2 under it, `name`/`spellCheck`/`autocomplete` on the login and registration fields, placeholders end with an ellipsis, `scroll-padding-top` for the sticky header, native selects take the theme's colours, `touch-action: manipulation`, `overscroll-behavior: contain` in the drawer, `translate="no"` on the brand and token codes, 24px hit area on chip remove buttons, and a `beforeunload` warning while an imported CV draft is unsaved. Left as is on purpose: Title Case for headings (the design rules and the Spanish copy use sentence case) and 32px theme buttons (above WCAG's 24px minimum, kept compact to fit a phone header).
- **Checked by screenshots** in light and dark (login, postings, profile, tokens) and on a phone in Spanish; the first phone capture overflowed the header, fixed by compacting it (icon-only log out, breadcrumb hidden under 640px).

## 2026-11-04 – Richer interface (supersedes the "no gradients, no shadow" part of the matte entry)
- **Why:** the owner found the login too basic and the language select unstyled, and asked for more colour, background and movement.
- **Login/register:** split screen; a green gradient brand panel with slow radar rings, drifting blobs, a headline and three benefits (hidden on phones), and the form on a card over a soft glow and dot grid.
- **Language:** a custom listbox menu (button, popover, EN/ES chips, check mark, arrow/Home/End/Enter/Escape) instead of the native select. The E2E and unit tests open the menu and pick an option.
- **App:** second hue (deep teal) mixed with the green, gradient page headers with an icon tile, gradient primary button, translucent header with an avatar, active nav marked by a green bar, cards and alerts that rise in, rows that stagger in, focus halo on fields.
- **Kept:** the matte, desaturated palette, light/dark/system themes and the contrast checks; all motion is off under `prefers-reduced-motion`.

## 2026-11-04 – SDD-007: assisted profile and token guide
- **Months:** `startMonth`/`endMonth` (1-12) on jobs and studies, optional and only with their year, end not before start; stored in the existing JSON, so old profiles stay valid. Education keeps the same fields so both use one picker.
- **CV import `cv-v2`:** asks for months only when the CV states them, for every entry; the use case drops impossible months/ranges (`dates_incomplete`) and, when the CV gives a country, proposes `[country, "latam"]` flagged `locations_suggested` (where to work is a preference, not a CV fact). The scoring prompt is unchanged: months do not affect scores.
- **Widgets:** `Combobox` (multi autocomplete, ARIA combobox), `Select`, `MultiSelect`, `MonthYearInput`. Catalogs live in the web app: ~470 technologies (free entry still allowed for the stack), countries by name via `Intl.DisplayNames` (ISO code stays the stored value; `latam`/`worldwide` as keywords), ~60 languages stored by English name so the import and scoring keep working. Search ignores case, accents and punctuation and spells out `c#`, `c++`, `.net`.
- **Select keeps unknown stored values** (older free-text levels) as an extra option instead of dropping them.
- **Token guide:** four steps with copy buttons; the `.env` line carries the real token only while the one-time secret is on screen, then falls back to a placeholder.
- **Review fixes:** `aria-controls` only while the list is open; Escape in the multiselect returns focus to its button; disabled buttons drop the gradient so their text is readable.
- **Not done yet:** a real CV through Groq with `cv-v2` (costs cents; the owner is asked first).

## 2026-11-04 – SDD-008 closed and SDD-009: shared catalog and guided first use
- **Google sign-in** works end to end with a real account (sign in, sign out, sign in again); security notes added to `docs/security-review.md`.
- **CV import on Groq:** `gpt-oss` spent its output tokens thinking and the longer `cv-v2` answer was cut off (even at 8000). Fix: `reasoning_effort: "low"` for `openai/gpt-oss*` and an 8000-token default; checked with a synthetic CV (months, current job, studies, languages, certifications all filled).
- **Catalog (ADR-0004):** a posting with no owner is shared; scores, profiles and AI spend stay per account. Administrators are `ADMIN_EMAILS` with a verified (Google) email. Only `scope=catalog` writes need it. Dedupe through `catalogKey`.
- **Data step:** `apps/api/scripts/move-postings-to-catalog.ts` (idempotent) moved the 29 Get on Board postings of the demo account to the catalog after a dump; first-account adoption no longer touches ownerless postings.
- **First use:** the list shows the catalog; without a profile a banner leads to it; after saving, "Score the newest jobs" scores up to 10 unscored ones one by one and stops on a budget error. Tokens and the n8n guide are administrator-only.
- **n8n:** workflow 1 sends `scope: "catalog"` and fails loudly on 403; the token must come from the administrator account.
- **Tests that read `.env`:** the "Google not configured" test now clears the GOOGLE_* variables itself, so a developer's real `.env` cannot break it.


## 2026-11-06 – SDD-010 T1: batch scoring behind a queue port
- **Done:** `ScoringBatch` / `ScoringJob` tables (migration `20261106120000_add_scoring_batches`), `ScoringQueue` port, `StartScoringBatch`, `GetScoringBatch`, `ProcessScoringJob`, in-process queue (default), `POST /scoring/batches` (`202`, `200` with `requested: 0`, `422 profile_not_configured`, `400` bad limit) and `GET /scoring/batches/:id` (`404` for another account's batch).
- **Failure handling:** a failed job is recorded with the machine code and never thrown, so a queue will not retry it. Budget, missing configuration or missing profile fail the rest of the batch without more AI calls. A job that is no longer `queued` is skipped (redelivery never scores twice; the update is conditional in SQL).
- **In-process limits:** jobs still queued when the API stops stay `queued` (no recovery in T1); SQS in T2 is the durable path.
- **Not done yet:** the web still scores one by one (T3), the SQS adapter and the signed worker endpoint (T2). `pnpm quality` green.

## 2026-11-06 – SDD-010 T2: SQS adapter, signed worker endpoint, worker Lambda
- **Done:** `SqsScoringQueue` (chosen when `SQS_QUEUE_URL` is set; batches of 10), `POST /internal/scoring/jobs/:id/process` (`@Public` for the session guard, protected by `WorkerSignatureGuard`, hidden from Swagger, fails closed without `WORKER_SECRET`), `apps/worker` (`createHandler`, partial batch responses, 404 dropped), `@jobradar/shared/worker-signature` (HMAC-SHA256 over `timestamp.METHOD.path`, 5-minute window, constant-time compare; a subpath export so the web bundle never imports `node:crypto`). Env: `SQS_QUEUE_URL`, `AWS_REGION`, `AWS_ENDPOINT_URL`, `WORKER_SECRET` (the queue requires the secret, 32+ chars).
- **Verified with LocalStack** (`docker compose --profile aws up -d localstack`, `RUN_LOCALSTACK=1`): batch of 3 goes API → SQS → worker handler → API → 3 scores, a redelivery scores nothing twice, an undeleted message ends in the DLQ. The test is opt-in and skipped in `pnpm quality` and CI. LocalStack moves a message to the DLQ one receive later than AWS documents, so the test polls instead of asserting the exact receive.
- **Not done yet:** the web still scores one by one (T3). Terraform decides `maxReceiveCount` (3) and the Lambda timeout (T4).

## 2026-11-06 – SDD-010 T3: web scores the newest jobs through a batch
- **Done:** "Score the newest jobs" calls `POST /scoring/batches` and polls `GET /scoring/batches/:id` every 1.5 s until nothing is queued; the button shows `done + failed` of `requested`, the list reloads as verdicts arrive, failed jobs are explained with the translated machine code (`errors.<code>`, shared with `ErrorMessage` through `errorCodeKey`). `nothingToScore` is shown when the API queued nothing. Closing the tab no longer stops the work.
- **Not kept:** the browser-side loop over `POST /postings/:id/score` (single scoring from a row is unchanged).
- **Known limit:** reopening the page does not resume following a batch (the id lives in component state); the scores still appear in the list. Acceptable for now, cheap to add later with `sessionStorage`.
- **Verified:** `pnpm quality` and the Playwright suite (5 tests, in-process queue) green.
