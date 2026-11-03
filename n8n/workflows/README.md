# n8n workflows

Exported workflows (SDD-003). n8n is pinned in `docker-compose.yml` (`2.40.5`); the JSON files are tested by `pnpm test`
(structure, no secrets, embedded mapper in sync).

| File | Trigger | What it does |
|---|---|---|
| `01-collect-getonboard.json` | every 6 h, or manually | Reads up to 5 pages (100 each) of the Get on Board public API (programming category), keeps jobs published in the last 48 h, maps them (`../code/map-job.js`), `POST /postings` (`409` = already known) and scores the **new** ones with `POST /postings/:id/score`: at most 20 per run, stopping at the first `429` (daily AI budget spent). Ends with a run report (`Summary` node). |

## Run it locally
```bash
pnpm dev                                   # the API on :3000 (with a configured AI provider and a saved profile)
docker compose up -d n8n                   # n8n on http://localhost:${N8N_PORT:-5678}; create the owner account once
docker compose exec n8n n8n import:workflow --input=/workflows/01-collect-getonboard.json
```
Open the workflow in the editor and press *Execute workflow*, or from the CLI
(`-e N8N_RUNNERS_BROKER_PORT=5690` avoids a clash with the running instance):
```bash
docker compose exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=jobradarCollect1 --rawOutput
```
The workflow reaches the API through `$env.JOBRADAR_API_URL` (default `http://host.docker.internal:3000`, see `.env.example`).
Never put tokens or keys in a workflow: use n8n credentials.

## Notes
- Get on Board's list is not sorted by date, so every run reads all 5 pages and filters by `published_at`.
- Re-running is safe: URLs are deduplicated by the API, and only postings created in the run are scored.
- Postings beyond the 20-per-run cap (or after a `429`) stay unscored; list them with `GET /postings?verdict=unscored`.
- `../fixtures/getonboard-jobs.json` is a trimmed real response used by the mapper tests.
