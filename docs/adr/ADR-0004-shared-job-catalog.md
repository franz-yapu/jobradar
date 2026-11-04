# ADR-0004 – Shared job catalog and an administrator

**Status:** Accepted (2026-11-04) · Amends ADR-0002 (per-account data), which listed "shared posting catalog" as out of scope.

## Context
Postings belong to one account, so a new account starts empty and has nothing to look at until it ingests its own jobs. The product should work like this: a person signs in, sees jobs right away, is asked to fill in a profile, and from then on gets their own fit verdicts. Collecting jobs (n8n, API tokens) is a back-office task, not something every user should do or even see.

## Decision
1. **A posting without an owner is a catalog posting**, visible to every signed-in account. A posting with an owner stays private to that account (manual paste, personal tokens), exactly as today.
2. **Scores, profiles and AI spend stay per account.** A catalog posting is scored by whoever asks, against that person's profile, and the score is stored with that person's `userId`. Nobody sees another person's verdicts.
3. **One administrator role, defined in configuration:** `ADMIN_EMAILS` (comma-separated). An account is an administrator only if its email is in the list **and the email is verified** (`emailVerifiedAt`, i.e. Google sign-in). Password accounts have unverified emails, so without this rule anyone could register an administrator's address and become one. No role column, no admin screen.
4. **Only an administrator can write to the catalog**, by sending `scope=catalog` when creating a posting (browser session or API token; a token inherits its owner's role). A non-administrator sending it gets `403`. Without the flag a posting is private, so a leaked ordinary token can never pollute the catalog.
5. **Catalog dedupe is by normalized URL** through a dedicated unique key (`catalogKey`), because a unique index over a nullable `userId` does not deduplicate in PostgreSQL.
6. **Scoring is on demand**, per posting or for the newest unscored ones with a small cap, always inside the account's daily budget. No automatic scoring of every posting for every user.
7. Technical screens (API tokens, the n8n guide) are shown only to administrators.

## Alternatives considered
- **Copy every ingested posting into each account:** isolation stays trivial, but storage and ingestion grow with users and dedupe is per account.
- **Role column and admin UI:** more code and a first-admin bootstrap problem; a verified email in configuration is enough for one operator.
- **Score every catalog posting for every user automatically:** best experience, cost grows with users times postings.

## Consequences
+ A new account sees jobs on first visit; ingestion happens once.
+ Per-account isolation of profiles, scores and spend is untouched.
− Every posting query must combine "mine" and "catalog"; a mistake here could expose private postings, so cross-account tests are mandatory.
− Administrator status depends on a verified email: the operator must sign in with Google to administer.
