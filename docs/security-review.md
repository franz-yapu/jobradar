# Security review – accounts and data ownership (SDD-006)

**Date:** 2026-11-04 · **Scope:** `apps/api/src/auth`, the global guards, per-account data access, API tokens, the session handling in `apps/web` and the n8n workflows. Reviewed against the SDD-006 acceptance criteria.

## Checklist

| Area | Result |
|---|---|
| Authentication | Every endpoint goes through the global `AuthGuard`; only `/health`, `/docs` and `/auth/register|login|logout` are `@Public()`. A missing or invalid session/token is `401 unauthenticated`. |
| Passwords | scrypt (N=2^16, r=8, p=2), 16-byte random salt, parameters stored in the hash, `timingSafeEqual`, NFKC-normalized, bounded scrypt parameters on verify. Passwords are never logged nor returned. |
| Sessions | 256-bit random tokens; only their SHA-256 is stored. httpOnly, `SameSite=Lax`, host-only, `Secure` in production, 14-day expiry. Logout deletes the row server-side and clears the cookie. |
| Login enumeration | Unknown email and wrong password return the same `401 invalid_credentials`, and the unknown email is verified against a dummy hash so timing stays comparable. `email_taken` on registration does reveal an existing email; accepted for v1 because email verification is out of scope. |
| Brute force | 5 failures per email and 20 per address per 15 minutes on login; 20 registrations per address per hour. `Retry-After` on `429`. The limiter is in-memory and per process (see risks). |
| CSRF | `SameSite=Lax` plus `OriginGuard` on every write: a cookie-authenticated write with an unlisted `Origin` is `403 bad_origin`. Requests without `Origin` and Bearer-token requests are exempt because they do not rely on the cookie. |
| CORS | Explicit allow-list from `WEB_ORIGIN`, `credentials: true`, never a wildcard. |
| API tokens | `jr_` + 256 random bits; only the SHA-256 is stored; the secret is shown once. Revocation is immediate and idempotent. Another account's token is `404`. At most 10 active per account. Token management requires a browser session (`403 session_required`), so a leaked token cannot mint a replacement. |
| Data isolation | Every repository method takes the owner `userId` first; no controller can forget it without a type error. Another account's posting, profile, score, token or usage is `404`. Integration tests cover two real accounts and the same URL in both. |
| AI budget | Metered per account (`userId` on every AI call and budget query). |
| Sensitive data in responses | Responses contain only `{ id, email }` for users and never hashes, session tokens or API-token secrets (only the one-time creation response). |
| Secrets at rest / in the repo | Only hashes in the database; `.env` is ignored; workflow JSON uses `$env.JOBRADAR_API_TOKEN`, and a test refuses a literal token. The dev database was dumped before the ownership migration. |
| Client session handling | The browser never sees a token (httpOnly cookie). On logout, login or a lost session every cached query except "who am I" is dropped, so a second person on the same browser sees no data. The post-login return address only accepts local paths. |
| Legacy data | Adoption runs once, inside the first registration transaction, under an advisory lock; later accounts start empty. A failed registration adopts nothing. |
| Browser policy in tests | The E2E server refuses to start unless the database name ends in `_test`/`_e2e`, and now deletes users as well, so legacy adoption cannot leak rows between runs. |

## Residual risks and recommendations

1. **Throttle state is per process.** With several API instances the limits multiply. Move `AttemptLimiter` to a shared store (Redis/Postgres) before scaling out.
2. **Client IP behind a proxy.** `req.ip` uses the socket address unless the app trusts a proxy; behind a load balancer every request may share the proxy IP, weakening the per-address limit. Configure `trust proxy` for the deployment topology.
3. **No security headers.** The API does not set Helmet-style headers. The dashboard should set CSP, `X-Content-Type-Options`, `Referrer-Policy` and HSTS at the reverse proxy/CDN in front of the deployed build.
4. **Swagger is public.** `/docs` is intentionally public for the demo; disable it or protect it in production.
5. **No password recovery / email verification.** Accepted by the PRD for v1; a lost password needs the operator and anyone can register with an unverified address (mitigated by `ALLOW_SIGNUP` and the registration throttle).
6. **Session cookie renewal.** The server extends a session when it is more than a day old, but the browser cookie keeps its original expiry; the user logs in again after 14 days even if active. Not a security issue, but worth aligning if longer sessions are wanted.
7. **Same-site deployment assumed.** Cross-site cookies would need `SameSite=None; Secure` and a different CSRF story; the README documents that the dashboard and API share a site or reverse proxy.
