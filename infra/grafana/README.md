# Grafana: AI latency, tokens and cost (SDD-010)

One provisioned dashboard, **JobRadar – AI latency, tokens and cost**, read straight from the `ai_calls` table (no Prometheus,
no `/metrics`). Everything is code: the datasource, the dashboard provider and `dashboards/ai.json` are mounted read-only.

## Run it
```bash
# once: a password for the read-only role (any value; .env is git-ignored)
echo "GRAFANA_DB_PASSWORD=$(openssl rand -hex 16)" >> .env
pnpm db:deploy            # creates the grafana_reader role (migration 20261106140000)
docker compose up -d postgres
pnpm grafana:setup        # lets grafana_reader log in with that password
docker compose up -d grafana
```
Open <http://localhost:3001> (`GRAFANA_PORT`); Grafana's own admin login is `admin` / `admin` until you change it (local only: do not expose this port).

## What it shows
Stats (calls, estimated cost, error rate, p95 latency), latency p50/p95 per hour, input/output tokens, cost by model, calls by
outcome (`ok`, `error`, `refused`, `budget_blocked`) and a per-purpose/per-model table. Filters: purpose and model; default range 7 days.
Colours: one fixed colour per entity (the model keeps its colour whatever else is selected), status colours reserved for outcomes
and the error-rate threshold (5 % warning, 20 % critical).

## Safety
Grafana connects as `grafana_reader`: `SELECT` on the metric columns of `ai_calls` only. No `userId`, no `detail` (provider error
text), no other table, no writes. An integration test (`apps/api/test/grafana-reader.integration.test.ts`) pins this.
The role is created `NOLOGIN` by the migration, so no secret lives in git; `pnpm grafana:setup` sets the password.

## Changing the dashboard
`dashboards/ai.json` is not editable in the UI (`allowUiUpdates: false`). Edit the JSON (or build in the UI, export, paste) and
restart Grafana. In AWS, point a datasource at the same database with the same role; the dashboard does not change.
