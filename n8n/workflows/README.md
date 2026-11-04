# n8n workflows

Exported workflows (SDD-003). n8n is pinned in `docker-compose.yml` (`2.40.5`); the JSON files are tested by `pnpm test`
(structure, no secrets, embedded mapper in sync).

| File | Trigger | What it does |
|---|---|---|
| `01-collect-getonboard.json` | every 6 h, or manually | Reads up to 5 pages (100 each) of the Get on Board public API (programming category), keeps jobs published in the last 48 h, maps them (`../code/map-job.js`), `POST /postings` (`409` = already known) and scores the **new** ones with `POST /postings/:id/score`: at most 20 per run, stopping at the first `429` (daily AI budget spent). Ends with a run report (`Summary` node). |

| `02-daily-summary-telegram.json` | every day 08:00 (La Paz), or manually | Reads the postings stored in the last 24 h (`GET /postings?createdSince=`, up to 300) and sends one Telegram message: counts per verdict, the ✅ list (title, company, first reason, link; up to 10), plus how many ⚠️ and unscored. No new postings → a short "none" message. If the API does not answer the run **fails** (visible in n8n) instead of sending a misleading message. Formatter: `../code/build-summary.js`. |

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

## API token (once per account)
The API needs to know which account the workflows act for. Create a personal token while logged in and give it to n8n:

1. In the app, create a token (API tokens screen; until it exists, `POST /auth/tokens` with your session cookie and `{ "name": "n8n" }`). The secret (`jr_...`) is shown **once**.
2. Put it in `.env` as `JOBRADAR_API_TOKEN=jr_...` and run `docker compose up -d n8n` so the container sees it.
3. Re-import the workflows if they were imported before tokens existed (`n8n import:workflow`, then activate them again).

Every call to the JobRadar API sends `Authorization: Bearer $env.JOBRADAR_API_TOKEN`; the call to Get on Board never does. If the token is missing, wrong or revoked, workflow 1 stops with an error (it does not pretend there was nothing new) and workflow 2 fails. Revoke a token in the app at any time; a token cannot create or revoke tokens. The workflows act on that one account's data (its postings, profile, scores and AI budget).

## Telegram setup (workflow 2, once)
1. In Telegram, talk to `@BotFather`, send `/newbot` and keep the **token** it gives you (a secret: never commit it or paste it in chat).
2. Send any message to your new bot, then find your chat id in your own terminal:
   `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"` → `message.chat.id`.
3. Put it in `.env` as `TELEGRAM_CHAT_ID=<id>` and recreate n8n: `docker compose up -d n8n`.
4. In the n8n editor: *Credentials → New → Telegram API*, paste the token, name it `JobRadar Telegram bot`.
   Open workflow 2, pick that credential in the *Send to Telegram* node and press *Execute workflow*.
5. When both workflows work, switch them to *Active* so the schedules run (n8n must stay up).

## Notes
- Get on Board's list is not sorted by date, so every run reads all 5 pages and filters by `published_at`.
- Re-running is safe: URLs are deduplicated by the API, and only postings created in the run are scored.
- Postings beyond the 20-per-run cap (or after a `429`) stay unscored; list them with `GET /postings?verdict=unscored`.
- `../fixtures/getonboard-jobs.json` is a trimmed real response used by the mapper tests.
- The summary text is in Spanish (the owner's language); change the strings in `../code/build-summary.js` and the embedded copy together (a test fails if they drift).
