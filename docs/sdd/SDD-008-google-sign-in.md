# SDD-008 – Sign in and sign up with Google

**Status:** Implemented (2026-11-04) · **Week:** 4 · **Depends on:** SDD-006 · **Decision record:** ADR-0003

## Context
Accounts are email + password with unverified emails. People want to join and log in with Google, with Google's verified email, without losing the current method, and with the strongest practical security.

## Goal
"Continue with Google" on login and register; verified-email accounts; Google can be connected to an existing password account from inside it; password login keeps working.

## Scope
**In:** OIDC code flow with PKCE, flow state table, `IdentityProvider` port with a Google adapter, new session on success, connect/disconnect Google, set a password on a Google-first account, account screen, button and error messages (EN/ES), setup guide, tests.
**Out:** other providers, email verification for password accounts, password recovery, storing Google tokens or profile data, Google one-tap, roles.

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 | Data and domain: nullable password, `googleSub`, `emailVerifiedAt`, `oauth_flows`; login and `/auth/me` handle accounts without a password; shared schemas | Unit + Supertest |
| T2 | `IdentityProvider` port, Google adapter with `jose`, token verification | Verifier tests with local keys |
| T3 | Use cases, flow repository, controller, throttle, cookies | Unit + Supertest |
| T4 | Web: button, error messages, account screen (connect, disconnect, set password) | Component tests |
| T5 | E2E, README setup guide, security review | Playwright, checklist |

## Domain model
- `User` gains `googleSub?` (unique), `emailVerifiedAt?`; `passwordHash` becomes optional. `UserResponse` adds `hasPassword`, `googleLinked`, `emailVerified`.
- `OAuthFlow { id, stateHash, nonce, codeVerifier, intent: "login" | "link", userId?, returnTo, expiresAt }`: single use, 10 minutes.
- Decision table on callback (verified Google identity `{ sub, email }`): `sub` known → log in · email owned by a password account, intent login → no change, redirect to `/login?error=google_link_required` · otherwise create the account (needs `ALLOW_SIGNUP`; the first account adopts legacy data as today) · intent link → attach `sub` to the session's user if no other account has it.

## Ports & adapters
- Port `IdentityProvider { authorizationUrl({state, nonce, codeChallenge}); verifyCallback({code, codeVerifier, nonce}) → { sub, email, emailVerified } }`; adapter `GoogleIdentityProvider` (token endpoint over TLS with the client secret, id_token verified with `jose` against Google's JWKS: RS256 only, `iss`, `aud`, `exp`, `nonce`, `email_verified === true`).
- Use cases: `StartGoogleFlow`, `CompleteGoogleFlow`, `UnlinkGoogle` (refused without a password), `SetPassword` (only when none is set, same password rules and hasher), existing `LoginUser` treats a missing hash like an unknown email (dummy hash, same `401`).
- Infrastructure: `OAuthController`; flow cookie `jr_oauth` (`httpOnly`, `SameSite=Lax`, path `/auth/google`, 10 minutes, holds `state`); `OAuthFlowRepository` (Prisma + in-memory); a per-IP limit on start and callback; config `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (all absent → feature off, endpoints answer `404`).
- Callback hygiene: state must match both the cookie and the stored hash, be unexpired and unused (deleted on first use); `returnTo` is a local path only; every failure redirects to `/login?error=<code>` with a generic code and no provider detail; a new session is issued (never reuse one); nothing sensitive is logged.

## API contract
| Endpoint | Result |
|---|---|
| `GET /auth/providers` (public) | `{ google: boolean }` |
| `GET /auth/google/start?returnTo=` (public) | `302` to Google with `state`, `nonce`, `code_challenge` (S256), `scope=openid email`; flow cookie set |
| `GET /auth/google/link` (browser session only) | same, bound to the current user · `401` without a session · `403 session_required` with an API token |
| `GET /auth/google/callback?code&state` (public) | `302` to the web app with the session cookie, or to `/login?error=` (`google_link_required`, `google_failed`, `signup_disabled`, `too_many_attempts`) |
| `DELETE /auth/google` (session only) | `204` · `409 password_required` |
| `PUT /auth/password {password}` (session only) | `204` only when the account has none · `409 password_exists` |
Schemas in `packages/shared`.

## Data changes
One migration (Prisma tooling): `users.passwordHash` nullable, `googleSub`, `emailVerifiedAt`, table `oauth_flows`; expired flows are deleted when a new one starts. Dev database backed up first.

## Setup (done by the owner, documented in the README)
Google Cloud Console → create a project → OAuth consent screen (External, scopes `openid`, `email`) → Credentials → OAuth client ID, type Web application → authorized redirect URI `http://localhost:3000/auth/google/callback` (and the production URL later) → put the id and secret in `.env`. The secret is never pasted in chat or committed.

## Test plan
- Unit (fake `IdentityProvider`): each row of the decision table; no auto-link; link and unlink rules; `SetPassword`; Google-only account password login → same `401`; `ALLOW_SIGNUP=false`; state reuse and expiry.
- Verifier (locally signed tokens and a local JWKS, no network): rejects wrong `aud`, `iss`, expired, wrong `nonce`, `email_verified=false`, `alg=none`, HS256, unknown key; accepts a valid one.
- Supertest: start sets the cookie and redirects with S256 and `state`; callback with a missing, wrong or replayed state is refused; open-redirect attempts fall back to `/`; endpoints `404` when unconfigured; guarded routes `401`.
- Web: button only when `/auth/providers` says so, error banners per code, account screen connect/disconnect/set password. Real Google is verified by hand with the owner's client.

## Acceptance criteria
- A new person can register and log in with Google; their email is marked verified and the cookie session works like any other.
- A Google email that matches a password account never logs in or links without the password; the existing methods keep working.
- Forged, replayed, expired or cross-browser callbacks are refused; Google tokens are not stored.
- `pnpm quality` and `pnpm e2e` pass; the security review is updated.

## Risks
- **Misconfigured redirect URI or consent screen** (the commonest failure): the setup guide and a clear `google_failed` message; in "Testing" mode only listed test users can sign in.
- **Account lockout** when unlinking: refused unless a password exists.
- **Dependence on Google availability:** password login stays.
- **Per-process throttle** (as in SDD-006) until a shared store exists.
