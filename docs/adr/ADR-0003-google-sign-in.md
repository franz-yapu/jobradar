# ADR-0003 – Sign in with Google (OpenID Connect)

**Status:** Accepted (2026-11-04) · Extends ADR-0002 (local accounts), whose ports were built to take another identity provider.

## Context
People should be able to create an account and log in with Google, keeping email + password. Google returns an email it has already verified, which local registration cannot (there is no email service). Security is the priority: a login flow is the most attacked part of an app.

## Decision
1. **Authorization code flow with PKCE (S256), done by the API.** The browser only follows redirects; the code is exchanged server to server with the client secret. Scopes: `openid email` only. Google's access and refresh tokens are never stored.
2. **Single-use flow state in the database** (`oauth_flows`: hash of `state`, `nonce`, PKCE verifier, intent, optional user, return path, 10-minute expiry) plus a `httpOnly` cookie holding the same `state`, so a callback only works in the browser that started it (login CSRF).
3. **The id_token is verified, not trusted**: signature against Google's JWKS (library `jose`, algorithms limited to RS256), `iss`, `aud` = our client id, `exp`, `nonce`, and `email_verified === true`. Accounts are keyed by Google's stable `sub`, never by email.
4. **No automatic linking by email.** Password accounts have unverified emails, so linking on a matching email would let someone who pre-registered a victim's address keep a password into the victim's account. If the Google email belongs to a password account, nothing is created or linked: the user is told to log in with the password and connect Google from the account page. A Google-first account may add a password later.
5. **Schema:** `users.passwordHash` becomes nullable, `googleSub` (unique) and `emailVerifiedAt` are added. A user without a password cannot log in by password (same `401` and timing as an unknown email). Disconnecting Google is refused when it would leave no way to log in.
6. **Behind a port** (`IdentityProvider`), so Cognito or another OIDC provider can replace Google; tests use a fake and a locally signed token, never the network.
7. Google sign-in is **off unless** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` are set; the web app asks `/auth/providers` before showing the button. `ALLOW_SIGNUP=false` also blocks creating accounts through Google (existing ones can still log in).

## Alternatives considered
- **Link by verified email automatically:** convenient, but see 4; Google's `email_verified` does not fix the unverified local side.
- **Client-side Google Identity Services button (token posted to the API):** less redirect code, but the API would trust a browser-supplied token and the flow has no PKCE/state of ours.
- **Passport.js / a hosted auth service:** more code or lock-in than one provider needs; the verified surface here is small.

## Consequences
+ Verified email, no password to leak for those users, same session cookie and guards afterwards.
+ Secrets and tokens of Google never reach the browser or the database.
− One new dependency (`jose`) and one Google Cloud OAuth client to create and keep (the secret lives in `.env`).
− Users who registered with a password and later try Google need one extra step (by design).
