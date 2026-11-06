# Deploying JobRadar (SDD-012, ADR-0005)

The app (web, API, Postgres, n8n, backups) runs on the VPS through **Coolify**; only the scoring queue and its worker live in
AWS. This is the order that works. Steps marked **you** need accounts or credentials Claude does not have. Coolify's labels
change between versions: follow the intent if a button is named differently.

```
Internet ─ Coolify (Traefik) ─ web (Caddy) ─ jobradar.vertexall.com      ─ /api ─► api ─► postgres
                                         └─ jobradar-n8n.vertexall.com ─ password ─► n8n ──► api (internal network)
AWS: SQS ─► Lambda worker ──(signed HTTPS)──► https://jobradar.vertexall.com/api/internal/...
```

## 0. Rehearse on your machine (optional, 5 minutes)
```bash
cat > /tmp/jobradar-test.env <<'ENV'
POSTGRES_PASSWORD=local-test-password-0123456789
WEB_ORIGIN=http://localhost:18095
ADMIN_EMAILS=you@example.com
N8N_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ENV
docker compose -p jr-local -f compose.prod.yml -f deploy/compose.local.yml --env-file /tmp/jobradar-test.env up -d --build
deploy/smoke.sh http://localhost:18095 --signup
docker compose -p jr-local -f compose.prod.yml -f deploy/compose.local.yml --env-file /tmp/jobradar-test.env down -v
```

## 1. DNS (you, nothing to do)
`vertexall.com` already has a wildcard `*` A record pointing at the VPS (DNS only, like your other sites), so `jobradar.vertexall.com` and `jobradar-n8n.vertexall.com` resolve already, and the wildcard certificate on the VPS covers them. **Do not create records and do not turn the Cloudflare proxy on** for these two names: the client-address setting (`CLIENT_IP_HEADERS`, step 7) assumes Traefik is the first hop. Until step 4 maps the domains, both names show your main site (the catch-all).

## 2. Google sign-in (you)
In Google Cloud Console → your OAuth client → *Authorized redirect URIs* add exactly
`https://jobradar.vertexall.com/api/auth/google/callback`. Under *OAuth consent screen* publish the app (*In production*), otherwise only registered test users can sign in.

## 3. Secrets (you)
Generate on your machine, keep them in your password manager, never in git or in chat:
```bash
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # N8N_ENCRYPTION_KEY  (keep it forever: n8n credentials are encrypted with it)
openssl rand -hex 24   # N8N_BASIC_AUTH_PASSWORD  (the browser asks for it, user "admin", before n8n shows anything)
openssl rand -hex 32   # WORKER_SECRET       (the same value goes to AWS in step 6)
```

## 4. Create the resource in Coolify (you)
1. *New resource* → *Docker Compose* from the GitHub repository `franz-yapu/jobradar`, branch `main`, **compose file `/compose.prod.yml`** (build pack *Docker Compose*, base directory `/`).
2. *Environment variables*: copy `.env.prod.example` and fill it in. Required: `POSTGRES_PASSWORD`, `WEB_ORIGIN=https://jobradar.vertexall.com`, `ADMIN_EMAILS` (your Google e-mail), `N8N_ENCRYPTION_KEY`, `N8N_BASIC_AUTH_PASSWORD`. Also `GOOGLE_*`, `GROQ_API_KEY`, `WORKER_SECRET`. Keep `AI_GLOBAL_DAILY_BUDGET_USD` (default 2): it is what limits the spend of open registration.
3. *Domains*: put **both** hosts on the one service **web** (port 80): `https://jobradar.vertexall.com,https://jobradar-n8n.vertexall.com`. Caddy inside `web` tells them apart by name: the first is the app, the second goes to n8n after asking for the password. Do not add a domain to `n8n`, `api`, `postgres` or `backup`.
4. Do **not** publish ports for any service. Deploy.
5. Check: `deploy/smoke.sh https://jobradar.vertexall.com --n8n-url https://jobradar-n8n.vertexall.com` (add `--signup` once to also check the session cookie; it leaves a throwaway account). The n8n lines must say it asks for credentials.

The first deploy applies the database migrations (the API container runs `prisma migrate deploy` before starting).

## 5. First administrator and n8n (you, then Claude can help)
1. Open the site and **sign in with Google** using the e-mail in `ADMIN_EMAILS` (only a Google-verified e-mail is an administrator).
2. *API tokens* → create one. Put it in Coolify as `JOBRADAR_API_TOKEN` (and `TELEGRAM_CHAT_ID` if you use the summary) and redeploy.
3. Open `https://jobradar-n8n.vertexall.com`: the browser asks for the gate password first (user `admin`), then n8n shows its own first screen: create the owner right away. Then import and activate the workflows from the Coolify terminal of the `n8n` service:
   ```bash
   n8n import:workflow --input=/workflows/01-collect-getonboard.json
   n8n import:workflow --input=/workflows/02-daily-summary-telegram.json
   ```
   Add the Telegram credential in the n8n UI (`n8n/workflows/README.md`), run workflow 01 once by hand, then activate both.

## 6. AWS queue and worker (you)
Needs the AWS CLI and Terraform on your machine, an AWS account and an alert e-mail. Everything is in [`infra/terraform/README.md`](../infra/terraform/README.md); the values that matter:
```bash
terraform -chdir=infra/terraform/bootstrap init && terraform -chdir=infra/terraform/bootstrap apply   # state bucket, once
aws ssm put-parameter --name /jobradar/worker-secret --type SecureString --value "<the WORKER_SECRET of step 3>"
pnpm --filter @jobradar/worker build
# terraform.tfvars:  api_url = "https://jobradar.vertexall.com/api"   (the /api prefix is part of it)
terraform -chdir=infra/terraform init -backend-config=backend.hcl && terraform -chdir=infra/terraform apply
```
Then let the API send jobs: create an IAM user, attach the `api_sender_policy_arn` output, create an access key and put `SQS_QUEUE_URL` (output `queue_url`), `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in Coolify; redeploy.
Prove the whole chain: `WORKER_SECRET=<secret> deploy/smoke.sh https://jobradar.vertexall.com` (the signed call must reach the API), then in the app press *Score the newest jobs* and watch the Lambda logs in CloudWatch. `terraform destroy` removes the AWS side when you are done.

## 7. Client address and Cloudflare (read before changing DNS)
The API rate-limits logins by client address. The default (`CLIENT_IP_HEADERS=X-Forwarded-For`) is right for your setup: Traefik is the first hop and overwrites whatever a client sends, and Caddy reads the header from the right and stops at the first address that is not a proxy. `CF-Connecting-IP` is ignored on purpose: with the VPS reachable directly (your other sites are not proxied) any client could send it and pick its own address.
Only if you someday put the **app host** behind Cloudflare's proxy **and** make the VPS accept web traffic from Cloudflare alone, set `CLIENT_IP_HEADERS=CF-Connecting-IP X-Forwarded-For`. Without that second condition, leave it as it is. `deploy/check-proxy.sh` covers both settings.

The n8n gate is a shared password at the proxy plus n8n's own login. The password is checked with bcrypt (slow on purpose), but there is no lock-out after failures: keep it long and random.

## Operating it
| Task | How |
|---|---|
| Update | Push to `main`, *Redeploy* in Coolify (or enable its auto-deploy webhook). Migrations run on start. Run one API instance only |
| Roll back | *Deployments* → redeploy the previous commit. Migrations are not undone: restore the last dump if a migration must be reverted |
| Back up now | `backup.sh once` in the `backup` service terminal. Daily dump at 03:00 UTC, 14 kept, in the `backups` volume |
| Restore (rehearse on a scratch database first) | stop `api`; `restore.sh /backups/<file>.dump postgresql://USER:PASS@postgres:5432/<db>`; start `api` |
| Backups stale | the `backup` service turns *unhealthy* in Coolify when no dump is younger than 26 h |
| Close registration | `ALLOW_SIGNUP=false`, redeploy, `deploy/smoke.sh <url> --expect-signup closed` |
| AI spend | `GET /ai/usage` per account; Grafana locally over an SSH tunnel to Postgres (not exposed). Caps: `AI_DAILY_BUDGET_USD`, `AI_GLOBAL_DAILY_BUDGET_USD` |
| Logs | Coolify per service (rotated, 3 x 10 MB) |

Backups live on the same disk as the database. Copy the latest dump somewhere else now and then (`scp` it, or a Coolify S3 backup destination) if the data matters.
