# @jobradar/worker

AWS Lambda that consumes the batch-scoring SQS queue (SDD-010). It holds no database credentials and no AI keys:
for each message it calls `POST {API_URL}/internal/scoring/jobs/:id/process`, signed with `WORKER_SECRET`
(HMAC, see `@jobradar/shared/worker-signature`). The API does the scoring, metering and budget checks.

| Variable | Meaning |
|---|---|
| `API_URL` | Public base URL of the API |
| `WORKER_SECRET_PARAM` | Name of the SSM SecureString holding the shared HMAC key (32+ chars); read once per cold start |
| `WORKER_SECRET` | Literal key for local runs and tests; wins over the parameter |

Partial batch responses are used: only the messages that failed go back to the queue (and to the DLQ after 3 receives).
A `404` (the job no longer exists) is dropped, not retried. Packaging and deployment: SDD-010 T4 (Terraform).
