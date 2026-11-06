# SDD-012 – Production hosting (VPS) with open registration

**Status:** Approved (2026-11-06) · **Week:** 4 · **Depends on:** SDD-006, 008, 009, 010 · **Decision record:** ADR-0005 (to write in T1)

## Context
JobRadar only runs on the developer's machine. SDD-010 built the SQS queue and the worker Lambda, but the worker calls the API back and needs a public HTTPS `api_url`. The roadmap wants a live demo at **https://jobradar.vertexall.com**. The original README listed RDS; with the API on a VPS a managed database adds cost and a second place to secure, so it is dropped. Registration stays open, which turns two accepted risks of the security review into real ones: AI spend (the budget is per account, so N accounts can spend N times the cap with the owner's key) and a public Swagger.

## Goal
API, web, Postgres and n8n run on the owner's VPS (deployed with Coolify) behind HTTPS, deployed from the repo with documented, repeatable steps; open registration cannot burn more than a fixed global AI budget per day; the SDD-010 worker reaches the API.

## Scope
**In:** production build and image of the API (`node dist`, migrations on start) · web static build · one small proxy container `web` (single origin for the app, `/api` to the API, security headers) · `deploy/compose.prod.yml` for Coolify (Docker Compose build pack; Coolify's Traefik owns TLS and the public ports) · global daily AI cap · trusted proxy for client IPs · Swagger off in production · Postgres not published, daily backup with retention · n8n inside the same compose on its own protected URL `https://jobradar-n8n.vertexall.com` (Cloudflare Access in front of n8n's own login; its workflows are schedule-triggered, so no public webhook is needed) · smoke test script · runbook · ADR-0005 · README fix (no RDS).
**Out:** Grafana in production (dashboards stay local), RDS/managed databases, autoscaling or several API instances, email verification and password recovery, CD pipeline (deploys are manual `docker compose pull/up`), `terraform apply` (the owner runs it with the new `api_url`).

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 ✅ | esbuild bundle (`build.mjs`; replaces `tsconfig.build.json` because the workspace package is TypeScript source), `build`/`start` scripts, API Dockerfile (multi-stage, non-root, `prisma migrate deploy` before start), `trust proxy`, `SWAGGER_ENABLED` (off when `NODE_ENV=production`), ADR-0005 | Image builds and boots against a throwaway Postgres; `/health` 200; `/docs` 404; unit test for env |
| T2 ✅ | Global AI cap: `AiCallRepository.totalsAll(since)`, `AI_GLOBAL_DAILY_BUDGET_USD`, checked in `MeteredAiProvider` next to the per-account cap | Unit tests with in-memory repo; Supertest with two accounts crossing the global cap |
| T3 | Web image + Caddy config (service `web`, plain HTTP on 80): static files, `/api` proxy with the prefix stripped, CSP / HSTS / `X-Content-Type-Options` / `Referrer-Policy`, SPA fallback; Caddy `trusted_proxies` + `client_ip_headers CF-Connecting-IP X-Forwarded-For` so the API gets one trustworthy `X-Forwarded-For` | Compose up locally on one port; Playwright E2E against that origin; test that a spoofed `X-Forwarded-For` does not change the seen IP |
| T4 | `deploy/compose.prod.yml` (web, api, postgres, n8n, backup; no `ports:`, Coolify routes `jobradar.vertexall.com` to `web:80` and `jobradar-n8n.vertexall.com` to `n8n:5678`), `.env.prod.example`, backup service (`pg_dump` daily, 14 kept, restore script and a tested restore) | Local run of the full stack; backup restored into a scratch database |
| T5 | `deploy/smoke.sh` (health, signup closed/open per env, cookie flags, headers, `/docs` absent, internal endpoint answers 401 unsigned) and `deploy/README.md` runbook: DNS, Google OAuth redirect `https://jobradar.vertexall.com/api/auth/google/callback`, `WEB_ORIGIN`, `ADMIN_EMAILS`, worker secret, Terraform `api_url`, n8n `JOBRADAR_API_URL=http://api:3000`, n8n `N8N_HOST`/`N8N_PROTOCOL=https`/`WEBHOOK_URL`, Coolify domain mapping, Cloudflare Access policy for the n8n host | Smoke script against the local production stack |

## Domain model
No new entities. `AiUsageTotals` is reused for the global total.

## Ports & adapters
- `AiCallRepository.totalsAll(since): Promise<AiUsageTotals>` (Prisma sums over all accounts; in-memory for tests).
- `MeteredAiProvider` blocks with `BudgetExceededError` when the account **or** the global total is spent; the blocked attempt is logged as `budget_blocked` with `detail` saying which cap. `MeteredOptions.globalDailyBudgetUsd` is optional (unset = no global cap, today's behaviour).
- Env: `AI_GLOBAL_DAILY_BUDGET_USD` (suggested default in `.env.prod.example`: 2), `SWAGGER_ENABLED`, `TRUST_PROXY` (hop count, e.g. `1`; Caddy is the only hop the API sees).

## API contract
No new endpoints. `GET /ai/usage` gains nothing in this SDD. The `429 ai_budget_exceeded` code is used for both caps; the web text already says the daily budget is used up.

## Data changes
None for the application. Operational: a Docker volume for Postgres and a backups volume.

## Test plan
Unit: global cap (inside both caps, account cap hit, global cap hit by another account's spend, unset cap), env parsing. Integration: two accounts exhaust the global cap, third gets `429` and no provider call. Image: build, boot with a throwaway database, `/health`, `/docs` absent, `Secure` cookie flag under `NODE_ENV=production`. Stack: Playwright E2E against the Caddy origin, smoke script, backup restore. Not testable here: the real VPS, Cloudflare and Google consent screen (owner steps in the runbook).

## Acceptance criteria
1. `docker compose -f deploy/compose.prod.yml up -d` on a clean machine yields a working app on one origin; the compose file publishes no host ports (locally an override adds one for tests); Postgres is reachable only inside the compose network and n8n only through its proxied URL.
2. Registration works; the sum of AI spend per UTC day never exceeds `AI_GLOBAL_DAILY_BUDGET_USD` plus at most one in-flight call per instance.
3. `/docs` is absent in production; responses carry the security headers; the login throttle sees the real client IP (`CF-Connecting-IP`/`X-Forwarded-For` through one trusted hop) and cannot be spoofed by the client.
4. A backup exists after 24 h and a restore into a scratch database is documented and tested.
5. With `api_url = https://jobradar.vertexall.com/api`, the worker's signed call to `/api/internal/scoring/jobs/:id/process` reaches the API (401 unsigned, 204 signed).
6. No secret in the repo; all values come from `.env.prod` on the server.

## Risks
- **AI cost:** open registration with the owner's key. Mitigated by the global cap; the cap is also a denial-of-service lever (anyone can exhaust the day's budget for everyone). Accepted for a demo; fallback is `ALLOW_SIGNUP=false`.
- **Public n8n editor:** it holds the API token and the Telegram bot credential. Two layers: Cloudflare Access (owner step, free tier) and n8n's own owner login. If Access is misconfigured only the n8n login remains, so the runbook has a check (`curl` must be redirected to Access) and n8n runs with `N8N_SECURE_COOKIE=true`.
- **Internal endpoint on the public API:** `/api/internal/...` is exposed; protected only by the HMAC. Caddy could restrict it to Cloudflare/AWS ranges, not done here.
- **Real IPs:** the chain is Cloudflare → Traefik (Coolify) → Caddy → API, so the API trusts exactly one hop (`TRUST_PROXY=1`) and Caddy normalises the header. A wrong value either makes everyone share one throttle bucket or lets clients spoof IPs. Covered by the smoke script and a unit test.
- **Google consent screen** in testing mode only admits registered test users; publishing it is the owner's step.
- **Data loss:** single VPS, single Postgres. Backups stay on the same host unless the owner adds an off-site copy (S3 upload is a later option).
- **Cannot verify here:** the VPS, DNS, Cloudflare and Coolify. Claude writes and tests the stack locally; the owner deploys.

## Decisions taken at approval
1. **Coolify** deploys the stack (compose build pack); Caddy only serves the static files and routes `/api`.
2. **Groq** (`openai/gpt-oss-20b`) stays the provider; global cap US$2/day.
3. **n8n** gets a protected URL (`jobradar-n8n.vertexall.com`, one level under the domain so Cloudflare's free certificate covers it).
