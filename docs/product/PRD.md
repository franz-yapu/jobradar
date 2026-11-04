# PRD – JobRadar

## Problem
Candidates waste hours reading job postings that don't fit (wrong country, C1 English required, junior, temporary).

## Users
Candidates, each with their own account and their own data (changed 2026-11-04: v1 was a single candidate; see ADR-0002). One profile per account; sharing data between accounts is out of scope.

## Core features (v1)
1. **Ingest postings** – from n8n (RSS/webhook) or manual paste. Dedupe by URL.
2. **Candidate profile & criteria** – stack, seniority, allowed locations, max English level, excluded contract types.
3. **AI scoring agent** – per posting: fit (✅ / ⚠️ / ❌), reasons, hard-blockers detected.
4. **Answer drafting** – drafts answers to application-form questions from the profile, never inventing experience.
5. **Dashboard** – list, filters, verdicts, links.
6. **Notifications** – n8n sends a daily summary (Telegram or email).
7. **Accounts** – sign up, log in and log out with email and password. Every posting, profile, score and AI cost belongs to one account and is visible only to it. n8n authenticates with personal API tokens.

## Non-functional
- AI cost and latency tracked per call. Budget limit per day.
- Works locally with `docker compose up`.
- Data isolation: one account can never read or change another account's data. AI budget is per account.
- Passwords are stored only as salted slow hashes; sessions can be revoked.

## Out of scope (v1)
Auto-applying, scraping sites that forbid it, email verification and password recovery (need an email service), social login, roles and paid plans, sharing postings between accounts.
