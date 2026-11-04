# SDD-007 – Assisted profile (autocomplete, selects, full CV fill) and an API-token guide

**Status:** Approved (2026-11-04) · **Week:** 4 · **Depends on:** SDD-005, SDD-006

## Context
The profile asks people to type stack items and country codes (`BO`) by hand, shows only years for jobs, and the CV import leaves several fields empty. The API-token screen creates a token but never says what to do with it, and n8n is where it has to go.

## Goal
1. Profile fields are chosen, not typed: autocomplete for stack and countries, selects and multiselects elsewhere, jobs with start and end month. 2. The CV import fills every field the CV states. 3. The token screen walks through putting the token into n8n.

## Scope
**In:** shared schemas (months) · CV prompt `cv-v2` and use case · web components `Combobox` (multi), `Select`, `MultiSelect`, `MonthYearInput` · stack catalog and country list · token guide · EN/ES · tests.
**Out:** a server-side catalog or admin of technologies, languages beyond EN/ES, editing past profile versions, a "test my token" button, Google (SDD-008).

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 | Shared schemas with months, CV prompt `cv-v2`, `ImportCv` | Shared + API unit tests |
| T2 | Web widgets (`Combobox`, `Select`, `MultiSelect`, `MonthYearInput`) and the stack/country catalogs | Component tests |
| T3 | Profile page and background editors use them; import draft shows suggestions | Component tests |
| T4 | Token guide | Component tests |
| T5 | E2E, docs, guidelines review | Playwright, `pnpm quality` |

## Domain model
- `ExperienceSchema` and `EducationSchema` gain optional `startMonth` / `endMonth` (1–12); the years stay, so stored profiles stay valid. Rules: end not before start; `current` means no end.
- `CV_WARNINGS` gains `locations_suggested` (the allowed locations were proposed, not read from the CV) and `dates_incomplete`.
- Catalogs live in the web app: `STACK_CATALOG` (~300 common technologies, canonical spelling, searchable by lowercase and without punctuation, e.g. "nodejs" finds "Node.js") and the ISO country list, shown by name through `Intl.DisplayNames` in the active language, plus `LatAm` and `Worldwide`. Any value outside the catalog can still be added for stack; locations stay ISO codes or the two keywords.

## Ports & adapters
- No new ports. `ImportCv` keeps using `AiProvider`; `CvExtractionSchema` and the system prompt (`cv-v2`) now ask for months, and the use case clamps them, drops impossible ranges (warning `dates_incomplete`) and, when the CV gives a country, proposes `allowedLocations = [country, "latam"]` flagged with `locations_suggested`. Contact data stays out (existing scrub). Nothing is invented: absent facts stay empty.
- Web: `Combobox` (ARIA combobox/listbox, type to filter, Enter or click adds, chips with remove, Backspace removes the last), `Select` (native element, styled), `MultiSelect` (checkbox list in a popover, used for excluded contracts), `MonthYearInput` (two selects: month names in the active language, year). `ProfilePage` and `BackgroundEditors` use them; the CV language level uses CEFR options plus "native", and an unknown legacy value is kept as an extra option.
- Token guide: `TokenGuide` panel on the tokens page, four steps with copy buttons: 1 name and create the token; 2 copy it (shown once) and add `JOBRADAR_API_TOKEN=jr_…` to the `.env` next to `docker-compose.yml` (the line is built with the real token right after creating it, with a placeholder otherwise); 3 apply it with `docker compose up -d n8n`; 4 in n8n import both workflows from `n8n/workflows/`, open them and activate them; check Executions for green runs, and a `401` there means the token was revoked. Also shows the API address n8n must reach.

## API contract
No new endpoints. `PUT /profile` and `POST /profile/cv` accept and return the new optional month fields and warning codes (schemas in `packages/shared`); older clients keep working.

## Data changes
None: the profile's background is stored as JSON, so months are additional keys.

## Test plan
- Shared: month ranges, end-before-start rejected, old payloads still parse.
- API unit: `ImportCv` fills months, clamps bad ones, proposes locations with the warning, never copies contact data; Supertest for the unchanged endpoints with the new fields.
- Web: `Combobox` (filter, no-punctuation match, keyboard, custom value, duplicates, chip removal), `MultiSelect`, `MonthYearInput`, country names in EN and ES, profile saves what was chosen, import draft shows suggested locations with the banner, token guide shows the real token line after creating and copy works.
- E2E: import a CV (fake AI with months), review, save, reload and find months and chosen countries; create a token and see the guide step with the `.env` line.
- Manual once approved: one real CV through Groq with `cv-v2` (a few cents; I ask first).

## Acceptance criteria
- No profile field needs a country code or exact spelling to be typed; stack and countries autocomplete; contracts, seniority and levels are selects.
- Jobs show start and end month; an imported CV with a complete history fills stack, summary, jobs with dates, studies, languages, certifications and English level.
- Anyone can follow the four steps and get n8n running with their token.
- `pnpm quality` and `pnpm e2e` pass; no existing profile breaks.

## Risks
- **Model quality:** a model may skip months or misread ranges; mitigation: clamp and warn, the draft is always reviewed before saving.
- **Catalog drift:** a static list ages; mitigation: free entry stays allowed and the list is a plain file.
- **Accessibility of custom widgets:** mitigated by ARIA patterns, keyboard tests and a guidelines review.
