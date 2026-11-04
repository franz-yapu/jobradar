# ADR-0002 – Accounts, sessions and per-account data

**Status:** Accepted (2026-11-04) · Amends the PRD, which excluded multi-user auth in v1.

## Context
JobRadar started as a single-candidate tool and the API has no authentication. It will be deployed to a server and offered as a small SaaS, so several people need their own account and must never see each other's postings, profile, scores or AI spend. n8n also calls the API without a browser.

## Decision
1. **Local accounts**: email + password (min. 10 characters), hashed with `scrypt` from Node's `crypto` (random salt, stored parameters, constant-time comparison). No native dependency. Login answers are identical for an unknown email and a wrong password, and attempts are rate limited.
2. **Sessions**: an opaque random token in an `httpOnly`, `SameSite=Lax` (and `Secure` in production) cookie. Only its SHA-256 hash is stored, with an expiry, so a session can be revoked at any time and a database leak does not leak usable sessions. State-changing requests also check the `Origin` header (CSRF).
3. **API tokens for n8n**: personal tokens created in the app, shown once, stored hashed, sent as `Authorization: Bearer`. They act as their owner and are revocable.
4. **Per-account data**: `userId` on postings, profile, scores and AI calls; a posting is unique per `(userId, url)`. Every repository query is scoped by the authenticated user; asking for another account's resource answers `404`, not `403`. The daily AI budget applies per account.
5. **Existing data**: the first account that registers adopts the rows that exist before accounts do (one time), so the current single-user data is not lost.
6. **Registration** is open and can be closed with `ALLOW_SIGNUP=false`.
7. **Behind a port**: the use cases see an `AuthenticatedUser` and `PasswordHasher` / `SessionStore` ports, so an external identity provider (e.g. Cognito on AWS) can replace the local one later.

## Alternatives considered
- **Stateless JWT**: no session table, but hard to revoke and the token lives in JavaScript-readable storage or needs a refresh scheme; sessions in the database are simpler to reason about at this scale.
- **External identity provider now** (Cognito, Auth0): less security code to own, but ties local development to a cloud service and delays the work; the port keeps the door open.
- **Shared posting catalog** with per-account scores: collects once for everyone, but mixes private postings (pasted by hand) with public ones and needs visibility rules; postponed.
- **argon2**: the stronger default, but a native build step; `scrypt` with strong parameters is acceptable and dependency-free.

## Consequences
+ Data isolation is enforced in one place per repository and covered by cross-account tests.
+ Revocable sessions, no secrets in the browser's JavaScript.
+ The identity provider can change without touching the use cases.
− Every table and many tests change (`userId`, login in tests).
− No email verification or password recovery until an email service exists: a forgotten password needs the operator.
− Collection in n8n runs per account (one token each) until a shared catalog is built.
