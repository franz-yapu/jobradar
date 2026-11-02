# PRD – JobRadar

## Problem
Candidates waste hours reading job postings that don't fit (wrong country, C1 English required, junior, temporary).

## Users
A single candidate (v1). Multi-profile is out of scope.

## Core features (v1)
1. **Ingest postings** – from n8n (RSS/webhook) or manual paste. Dedupe by URL.
2. **Candidate profile & criteria** – stack, seniority, allowed locations, max English level, excluded contract types.
3. **AI scoring agent** – per posting: fit (✅ / ⚠️ / ❌), reasons, hard-blockers detected.
4. **Answer drafting** – drafts answers to application-form questions from the profile, never inventing experience.
5. **Dashboard** – list, filters, verdicts, links.
6. **Notifications** – n8n sends a daily summary (Telegram or email).

## Non-functional
- AI cost and latency tracked per call. Budget limit per day.
- Works locally with `docker compose up`.

## Out of scope (v1)
Auto-applying, scraping sites that forbid it, multi-user auth.
