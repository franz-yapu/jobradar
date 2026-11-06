# Deploying JobRadar (SDD-012, ADR-0005)

The app (web, API, Postgres, n8n, backups) runs on the VPS through **Coolify**; only the scoring queue and its worker live in
AWS. This is the order that works. Steps marked **you** need accounts or credentials Claude does not have. Coolify's labels
change between versions: follow the intent if a button is named differently.

```
Internet ─ Cloudflare ─ Coolify (Traefik) ─ web (Caddy) ─ /api ─► api ─► postgres
                              └─ jobradar-n8n.vertexall.com ─► n8n ──► api (internal network)
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

## 1. DNS and Cloudflare (you)
1. In Cloudflare DNS for `vertexall.com` add two **A** records, proxied (orange cloud), pointing at the VPS public IP: `jobradar` and `jobradar-n8n`. (One label under the domain, so the free universal certificate covers both.)
2. SSL/TLS mode **Full (strict)**. If Traefik cannot obtain its certificate while proxied, set the two records to *DNS only*, deploy, wait for the certificate, then turn the proxy back on.
3. **Protect n8n before anything else maps to it** (Zero Trust → Access → Applications → *Self-hosted*): application domain `jobradar-n8n.vertexall.com`, policy *Allow* for your e-mail only. A fresh n8n lets the first visitor create the owner account; Access must already be in front.

## 2. Google sign-in (you)
In Google Cloud Console → your OAuth client → *Authorized redirect URIs* add exactly
`https://jobradar.vertexall.com/api/auth/google/callback`. Under *OAuth consent screen* publish the app (*In production*), otherwise only registered test users can sign in.

## 3. Secrets (you)
Generate on your machine, keep them in your password manager, never in git or in chat:
```bash
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # N8N_ENCRYPTION_KEY  (keep it forever: n8n credentials are encrypted with it)
openssl rand -hex 32   # WORKER_SECRET       (the same value goes to AWS in step 6)
```

## 4. Create the resource in Coolify (you)
1. *New resource* → *Docker Compose* from the GitHub repository `franz-yapu/jobradar`, branch `main`, **compose file `/compose.prod.yml`** (build pack *Docker Compose*, base directory `/`).
2. *Environment variables*: copy `.env.prod.example` and fill it in. Required: `POSTGRES_PASSWORD`, `WEB_ORIGIN=https://jobradar.vertexall.com`, `ADMIN_EMAILS` (your Google e-mail), `N8N_ENCRYPTION_KEY`. Also `GOOGLE_*`, `GROQ_API_KEY`, `WORKER_SECRET`. Keep `AI_GLOBAL_DAILY_BUDGET_USD` (default 2): it is what limits the spend of open registration.
3. *Domains*: service **web** → `https://jobradar.vertexall.com` (port 80); service **n8n** → `https://jobradar-n8n.vertexall.com` (port 5678). Do not add a domain to `api`, `postgres` or `backup`.
4. Do **not** publish ports for any service. Deploy.
5. Check: `deploy/smoke.sh https://jobradar.vertexall.com` (add `--signup` once to also check the session cookie; it leaves a throwaway account).

The first deploy applies the database migrations (the API container runs `prisma migrate deploy` before starting).

## 5. First administrator and n8n (you, then Claude can help)
1. Open the site and **sign in with Google** using the e-mail in `ADMIN_EMAILS` (only a Google-verified e-mail is an administrator).
2. *API tokens* → create one. Put it in Coolify as `JOBRADAR_API_TOKEN` (and `TELEGRAM_CHAT_ID` if you use the summary) and redeploy.
3. Open `https://jobradar-n8n.vertexall.com` (Access login first), create the n8n owner, then import and activate the workflows from the Coolify terminal of the `n8n` service:
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

## 7. Optional hardening (you, think first)
The API trusts `CF-Connecting-IP` as the client address when it comes through the proxy chain. Someone who reaches the VPS **without** Cloudflare could send their own. If every site on that VPS is proxied by Cloudflare, restrict ports 80/443 to [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) in the VPS firewall. If other sites there are not proxied, do not: you would take them down. For a demo the residual risk is only a spoofable login rate limit.

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
