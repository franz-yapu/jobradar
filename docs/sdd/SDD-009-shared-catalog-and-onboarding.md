# SDD-009 – Shared job catalog and guided first use

**Status:** Draft (2026-11-04), waiting for approval · **Week:** 4 · **Depends on:** SDD-006, 007, 008 · **Decision record:** ADR-0004

## Context
A new account is empty: jobs are per account and only n8n (with that account's token) fills them. Users should enter, see jobs, be asked to fill their profile, and then use the system; collection settings should stay behind the scenes.

## Goal
Signed-in users see a common catalog plus their own private postings; saving a profile unlocks their own verdicts; administrators feed the catalog; tokens/n8n are hidden from everyone else.

## Scope
**In:** nullable owner = catalog posting · `ADMIN_EMAILS` + verified-email admin rule · `scope=catalog` on create (admin only) · list/get/score over mine + catalog · first-use guidance in the web app · tokens/n8n screens for administrators only · data migration of existing ingested postings · n8n workflows send `scope=catalog` · tests, E2E, docs.
**Out:** admin screen, roles table, automatic scoring of all postings per user, per-user hiding or saving of catalog postings, editing or deleting catalog postings from the UI, notifications per user.

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 | Schema (`catalogKey`), migration of existing non-manual postings into the catalog, `isAdmin` in the authenticated user and `UserResponse`, `ADMIN_EMAILS` | Migration on a copy of the dev DB, unit tests |
| T2 | Postings: create with `scope=catalog`, list/get = mine + catalog, `scope` in responses, score only the caller's | Unit + cross-account Supertest |
| T3 | Scoring a catalog posting stores the score for the caller; "score the newest unscored" with a cap handled by the web | Unit + Supertest |
| T4 | Web: first-use banner and redirect to profile, post-save next step, tokens/n8n only for admins, EN/ES | Component tests |
| T5 | n8n workflows with `scope=catalog`, E2E (admin + two users), security review, docs, LOG | Playwright, checklist |

## Domain model
- `Posting.userId = null` ⇔ catalog. `catalogKey String? @unique` holds the normalized URL for catalog postings only. `(userId, url)` stays unique for private ones.
- `Posting` exposes `scope: "catalog" | "mine"`.
- `AuthenticatedUser { id, isAdmin }`: `isAdmin = email ∈ ADMIN_EMAILS && emailVerifiedAt != null`, computed per request (changing the variable takes effect on restart).

## Ports & adapters
- `PostingRepository`: `list(userId, filter)` returns private ∪ catalog; `findById(userId, id)` returns it when private to `userId` or in the catalog; `save` rejects a duplicate in the right scope (`DuplicatePostingError`). The latest score joined to each row is always the caller's.
- `CreatePosting` receives `scope` and `isAdmin`; `scope=catalog` without admin → `NotAllowedError` → `403 not_admin`.
- `ScorePosting` unchanged except it finds catalog postings; scores keep `userId = caller`.
- `Env.ADMIN_EMAILS: string[]` (lowercased, trimmed).

## API contract
| Endpoint | Change |
|---|---|
| `POST /postings` | optional `scope: "mine" \| "catalog"` (default `mine`); `catalog` needs admin else `403 not_admin`; duplicate → `409` in that scope |
| `GET /postings` | mine + catalog; item has `scope`; optional `scope` filter |
| `GET /postings/:id`, `POST /postings/:id/score`, `GET /postings/:id/score` | accept catalog postings; private ones of others stay `404` |
| `GET /auth/me`, login/register | `user.isAdmin` |

## Data changes
Migration made with Prisma tooling after a backup: add `catalogKey`; for postings with `source <> 'manual'`, keep the oldest per normalized URL as a catalog posting (`userId = null`, `catalogKey` set), repoint scores of dropped duplicates to the kept one. Manual postings stay private.

## Web behaviour
- No profile: the postings list is visible; a banner explains "fill your profile to see if each job fits" with a button; scoring buttons lead to the profile.
- Profile saved: back to the list with a "Score the newest jobs" action (up to 10, one by one, stops on budget error).
- Navigation shows Tokens and the n8n guide only when `user.isAdmin`; the route redirects others.

## Test plan
Unit: admin rule (unverified email never admin), create scope rules, list/find visibility, scoring of a catalog posting. Supertest: user B never sees user A's private posting but sees catalog; non-admin `scope=catalog` → 403; admin token writes catalog; duplicate catalog URL → 409; scores are never shared. Component: banner, redirect, hidden tokens. E2E: admin loads catalog, new user sees it, fills profile, scores.

## Acceptance criteria
A new account sees catalog jobs on first visit · is guided to the profile and can save it · can score and see only its own verdicts · ordinary tokens cannot write to the catalog · tokens/n8n screens are invisible to non-admins · `pnpm quality` and `pnpm e2e` pass.

## Risks
Query mixing private and catalog rows (mitigated by cross-account tests) · administrator via unverified email (verified-email rule) · migration touching real data (backup, run on a copy first) · AI spend per user (existing per-account budget, cap of 10).
