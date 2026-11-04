# SDD-006 – Accounts: sign up, login and per-account data

**Status:** Implemented (2026-11-04) · **Week:** 4 · **Depends on:** SDD-001…005 · **Decision record:** ADR-0002 (PRD updated)

## Context
The API has no authentication and all data is one person's. The app will be deployed as a small SaaS: people create their own account, and nobody may read or change another account's postings, profile, scores or AI spend. n8n needs a non-browser way in.

## Goal
Register, log in and out with email and password; every request is authenticated; every row belongs to one account and queries are scoped to it; n8n works with personal API tokens; the first account adopts the data that exists today.

## Scope
**In:** users, sessions, API tokens · `/auth/*` endpoints · global auth guard · `userId` on postings, profile, scores, AI calls · per-account AI budget · one-time adoption of existing data · login/register screens, route guard, logout, API-token screen · n8n workflows with a token · isolation tests, E2E.
**Out:** email verification, password recovery, social login, roles, plans, sharing between accounts, shared posting catalog, per-account Telegram chat, external identity provider (the ports leave room for it).

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 | Backend auth: tables, hashing, register / login / logout / me, sessions, guard, throttle, Origin check | Unit + Supertest |
| T2 | Data ownership: `userId` everywhere, scoped repositories, per-account budget, adoption migration | Cross-account tests |
| T3 | API tokens + n8n workflows with a token | Tests, manual n8n run |
| T4 | Dashboard: login, register, guard, logout, tokens screen, EN/ES | Component tests |
| T5 | E2E (two accounts), docs, security review | Playwright, checklist |

## Domain model
- `User { id, email (unique, lowercase), passwordHash, createdAt }`.
- `Session { id, userId, tokenHash (unique), expiresAt, createdAt }`: only the SHA-256 of the cookie token is stored. 14 days, extended on use at most once a day.
- `ApiToken { id, userId, name, prefix, tokenHash (unique), createdAt, lastUsedAt, revokedAt }`: format `jr_<random>`, shown once; `prefix` (first 8 characters) identifies it in the list.
- `userId` is added to `postings` (unique `(userId, url)` replaces unique `url`), `candidate_profiles` (one per user), `posting_scores` and `ai_calls`. Columns stay nullable only for legacy rows; the domain always sets them.
- Password rules: 10–128 characters and different from the email. Email is trimmed and lowercased.

## Ports & adapters
- Domain ports: `UserRepository`, `SessionRepository`, `ApiTokenRepository`, `PasswordHasher`, `SecureTokenGenerator`, `LegacyDataAdopter`, `Clock`. Adapters: Prisma repositories, `ScryptPasswordHasher` (Node `crypto.scrypt`, random 16-byte salt, parameters stored in the hash string, `timingSafeEqual`).
- Use cases: `RegisterUser`, `LoginUser`, `LogoutUser`, `GetCurrentUser`, `AuthenticateRequest` (cookie or Bearer → `AuthenticatedUser { id }`), `CreateApiToken`, `ListApiTokens`, `RevokeApiToken`.
- Infrastructure: global `AuthGuard` (everything is protected unless marked `@Public()`: `/health`, `/auth/register`, `/auth/login`, `/docs`), `@CurrentUser()` decorator, `OriginGuard` (state-changing requests that use the cookie must carry an `Origin` in `WEB_ORIGIN`, else `403 bad_origin`; Bearer requests are exempt), `LoginThrottle` (in memory: 5 failures per email and 20 per IP per 15 minutes → `429 too_many_attempts`; to be moved to a shared store with several instances), CORS with credentials for `WEB_ORIGIN`.
- **Ownership:** every use case receives the `userId` and every repository method filters by it (`PostingRepository.list(userId, filter)`, `ProfileRepository.get(userId)`, …). `GenerateStructuredRequest` gains `userId` so `MeteredAiProvider` logs and budgets per account. A resource of another account is `404`.
- **Adoption:** inside the registration transaction, if the user table was empty, `LegacyDataAdopter` sets `userId` on rows where it is null. Later accounts start empty.
- Login runs a dummy hash for unknown emails and returns the same `401 invalid_credentials` as for a wrong password.

## API contract
| Endpoint | Result |
|---|---|
| `POST /auth/register {email, password}` | `201 { id, email }` + cookie · `400` invalid · `409 email_taken` · `403 signup_disabled` (`ALLOW_SIGNUP=false`) · `429` |
| `POST /auth/login {email, password}` | `200 { id, email }` + cookie · `401 invalid_credentials` · `429 too_many_attempts` |
| `POST /auth/logout` | `204`, session deleted, cookie cleared |
| `GET /auth/me` | `200 { id, email }` · `401` |
| `GET / POST /auth/tokens`, `DELETE /auth/tokens/:id` | list (name, prefix, dates) · create `{ name }` → `201 { id, name, token }` (the only time the token is shown) · revoke `204` |
| All other endpoints | `401 unauthenticated` without a valid cookie or Bearer token |
Cookie `jr_session`: `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `NODE_ENV=production`. Schemas in `packages/shared`.

## Data changes
One migration: `users`, `sessions`, `api_tokens`; nullable `userId` (+ index and foreign key) on the four tables; unique `url` replaced by unique `(userId, url)`. I back up the dev database first. Existing rows keep `userId = null` until the first registration adopts them.

## Test plan
- Unit: hasher (verifies, salts differ, rejects tampering), register/login/logout/me with in-memory adapters, session expiry and extension, throttle window, token creation/revocation, adopter runs only for the first user.
- Supertest: auth flows, cookie flags, `401` on every protected route (table-driven over all routes), `403 bad_origin`, signup disabled, Bearer auth, revoked token.
- **Isolation (the core test):** accounts A and B, same URL in both is allowed; A never lists, reads, scores or deletes B's postings, profile, scores, usage or tokens (`404`); the budget of A does not spend B's.
- Web: login/register forms, errors, redirect when unauthenticated, logout clears the cache, tokens screen, EN/ES. E2E: register → data → logout → second account sees nothing → unauthenticated redirect.
- n8n workflow test: requests carry `Authorization` from `$env.JOBRADAR_API_TOKEN`; no secrets in the JSON.

## Acceptance criteria
- Without a session or token no endpoint except the public ones answers with data.
- Two accounts never see each other's data (tests above); the first account keeps today's data.
- Passwords and session/API tokens are stored only hashed; the login does not reveal whether an email exists.
- n8n workflows run with a token; `pnpm quality` and `pnpm e2e` pass.

## Risks
- **No password recovery or email verification:** a forgotten password needs the operator; anyone can sign up with any email (mitigation: `ALLOW_SIGNUP`, throttle).
- **Wide change:** every table and many tests change; mitigated by doing ownership separately (T2) with a table-driven isolation suite.
- **Throttle is per process:** fine for one instance, to be shared before scaling out.
- **Session cookie vs cross-origin deploys:** same-site deployment (same parent domain or reverse proxy) is assumed; documented in the README.
- **Legacy rows** stay hidden until the first registration; if nobody registers they remain orphaned (harmless).
