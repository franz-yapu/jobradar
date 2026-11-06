# JobRadar on AWS (SDD-010)

Terraform for the batch-scoring path only: **SQS** (jobs + dead-letter queue) → **Lambda** worker (`apps/worker`) → the API.
Not included (separate decision, SDD-012): hosting the API and the web, and the database. The worker holds no database
credentials or AI keys; it only calls the API, signed with a shared secret.

| File | What |
|---|---|
| `sqs.tf` | jobs queue + DLQ (3 deliveries, SSE, visibility timeout 6x the Lambda's) |
| `lambda.tf` | worker function (Node 22, arm64, 128 MB), SQS event source with partial batch responses and capped concurrency |
| `iam.tf` | worker role (one queue, one SSM parameter, own logs) and a `…-api-sender` policy for the API |
| `alarms.tf` | DLQ-not-empty alarm and a US$5/month budget, both only when `alert_email` is set |
| `bootstrap/` | one-time S3 bucket for the remote state |
| `tests/` | `terraform test` with a mocked provider (no credentials) |

## Checks that need no AWS account
```bash
cd infra/terraform
terraform fmt -check -recursive
terraform init -backend=false && terraform validate
terraform test          # queue wiring, least-privilege IAM, alarms, variable validation
```
The same runs in CI (`terraform` job). **`plan`/`apply` need your credentials and are run by you, never by CI or by Claude.**

## Deploy (you run this; use the free tier and `destroy` when done)
1. **State bucket (once):** `terraform -chdir=bootstrap init && terraform -chdir=bootstrap apply` → copy `state_bucket` into `backend.hcl` (from `backend.hcl.example`).
2. **Worker secret (once, outside Terraform so it never enters the state):**
   ```bash
   SECRET=$(openssl rand -hex 32)
   aws ssm put-parameter --name /jobradar/worker-secret --type SecureString --value "$SECRET"
   echo "WORKER_SECRET=$SECRET"   # put the same value in the API's environment, never in git
   ```
3. **Build the worker and apply:**
   ```bash
   pnpm --filter @jobradar/worker build
   cp terraform.tfvars.example terraform.tfvars   # set api_url (public HTTPS URL of the API) and alert_email
   terraform init -backend-config=backend.hcl && terraform plan && terraform apply
   ```
4. **API:** set `SQS_QUEUE_URL` (output `queue_url`), `AWS_REGION` and `WORKER_SECRET`, and attach the `api_sender_policy_arn` policy to the API's role or user. Without `SQS_QUEUE_URL` the API keeps scoring in-process.
5. Confirm the budget/alarm subscription e-mail AWS sends. Tear down with `terraform destroy` (the secret and the state bucket stay; delete them by hand if you want everything gone).

## Cost
SQS, Lambda (128 MB, a few seconds per job) and CloudWatch Logs stay inside the free tier at this volume. The budget alarm is a safety net, not a cap. AI spend is limited by `AI_DAILY_BUDGET_USD` in the API, not by AWS.
