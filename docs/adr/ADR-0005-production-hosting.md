# ADR-0005 – Production hosting on a VPS (Coolify), AWS only for the queue

**Status:** Accepted (2026-11-06) · Refines the README's original "AWS (S3, SQS, Lambda, RDS)" plan. See SDD-012 and SDD-010.

## Context
The app only ran locally. SDD-010 added an SQS queue and a worker Lambda that calls the API back, so the API needs a public HTTPS URL. The owner already runs a VPS (Contabo, Coolify with Traefik, Cloudflare in front of `vertexall.com`) with room to spare (7.8 GB RAM, 96 GB disk). Registration is open for the demo.

## Decision
1. **Host the API, the web, Postgres and n8n on the VPS**, deployed by Coolify from one Docker Compose file. **No RDS:** a managed database adds cost and a second perimeter for no benefit at this scale. Postgres is reachable only inside the compose network.
2. **AWS keeps only what SDD-010 built:** SQS, the worker Lambda, IAM and alarms.
3. **One origin for the app** (`https://jobradar.vertexall.com`): a small Caddy container serves the static web build and forwards `/api` to the API. No CORS in production, cookies stay `SameSite=Lax` and `Secure`. Coolify's Traefik terminates TLS.
4. **n8n has its own host** (`jobradar-n8n.vertexall.com`), mapped to the same `web` service as the app. Caddy asks that host for a shared password (bcrypt, generated from `N8N_BASIC_AUTH_PASSWORD` at start; closed for everybody if unset) before n8n's own login; n8n itself has no domain and no published port. Cloudflare Access was dropped: it needs the proxy, and the owner's sites (and this VPS's IP) are DNS-only behind a wildcard record.
5. **The API ships as one esbuild bundle** (`dist/main.mjs`) with dependencies external and the workspace package `@jobradar/shared` inlined (it is TypeScript source). The image is multi-stage, runs as a non-root user, applies `prisma migrate deploy` before starting and must run as a single instance.
6. **Behind proxies the API trusts exactly `TRUST_PROXY` hops** of `X-Forwarded-For`; Caddy normalises the header, believing only `X-Forwarded-For` from a private peer (Traefik) and reading it from the right (`trusted_proxies_strict`). `CF-Connecting-IP` is opt-in (`CLIENT_IP_HEADERS`), because the VPS is reachable without Cloudflare and a client could forge it. Swagger is off when `NODE_ENV=production`.
7. **Open registration is bounded by a global daily AI budget** (SDD-012 T2), on top of the per-account one.

## Alternatives considered
- **AWS for everything (ECS or App Runner + RDS):** closest to the original plan, but monthly cost outside the free tier and a much larger Terraform surface for a demo.
- **Bundle nothing, run with `tsx` in production:** works, but ships dev tooling and compiles on every start.
- **`tsc` output run with `node`:** the workspace package is published as `.ts`, so Node cannot import it; bundling is simpler than building the shared package.

## Consequences
+ Near-zero extra cost; the whole stack is inspectable on one machine; the worker has a public URL.
+ The image is reproducible and tested locally (migrations, non-root, `/docs` absent, `Secure` cookie, healthcheck).
− One VPS is one failure domain: backups (SDD-012 T4) are the safety net.
− A wrong `TRUST_PROXY` silently merges or spoofs client IPs; the smoke script checks it.
− The VPS hosts the owner's other projects: ports, names and resources must not clash (no published ports in our compose; unique service names).
