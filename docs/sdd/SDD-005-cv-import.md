# SDD-005 – CV import (PDF) and Metronic-style interface

**Status:** Implemented (2026-11-04; real CV import and eval re-run pending the owner's OK) · Approved (2026-11-04) · **Week:** 4 · **Depends on:** SDD-002, SDD-004

## Context
The profile is typed by hand and holds only six fields. The owner wants to upload a CV (PDF) and have the job-search profile, including academic data, extracted from it. The owner also asked for an interface built with Tailwind and "similar to Metronic" (a commercial admin template: left sidebar, top bar, white cards on a light grey page, soft shadows, rounded controls). Metronic's code and assets are licensed, so only the look and feel is reproduced, with our own components.

## Goal
Upload a PDF, review the extracted draft in the profile form, correct it and save it; the scoring uses the new data. The whole app gets the admin look.

## Scope
**In:** `POST /profile/import-cv` (draft only) · PDF text extraction behind a port · new AI purpose `cv_extraction` · profile extended with education, experience, languages and certifications · review UI · scoring prompt `score-v4` · app shell and design tokens for every screen · docs, tests.
**Out:** OCR for scanned PDFs, other formats (DOCX), storing the PDF, contact data (name, email, phone), several CVs or profiles, accounts (SDD-006), AWS (SDD-007).

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 | Backend: extractor port + adapter, schema + migration, `ImportCv` use case, endpoint | Unit (fakes), Supertest with a generated PDF |
| T2 | Metronic-style shell and tokens on all existing screens | Component tests, E2E still green |
| T3 | CV upload + review UI, new profile sections, EN/ES | Component tests |
| T4 | `score-v4` prompt using the new data, E2E for the import, docs | Prompt unit tests, E2E, evals only with the owner's OK |

## Domain model
Existing profile fields stay. New value objects (all optional lists, default empty, limits to bound prompt size):
- `Education { institution, degree, field?, startYear?, endYear? }` (max 10)
- `Experience { company, role, startYear?, endYear? | current, highlights: string[≤5] }` (max 15)
- `LanguageSkill { language, level }` (max 10) — the English level keeps driving `maxEnglishLevel`
- `certifications: string[]` (max 20)
`CvDraft` = the same shape as `SaveProfileBody` plus `warnings: string[]` (fields the model could not find). It is never stored; the profile changes only through `PUT /profile`, which now accepts the new fields (version bump as today).

## Ports & adapters
- Domain port `CvTextExtractor.extract(buffer): Promise<string>`; adapter `PdfParseTextExtractor` (`pdf-parse`). Errors: `NotAPdfError`, `TooManyPagesError` (>15), `NoTextError` (scanned/empty), text cut at 30 000 characters.
- `ImportCv` use case (application): extract text → `AiProvider.generateStructured({ purpose: "cv_extraction", system, content: cvText, schema: CvDraftSchema })` → normalize (countries to ISO codes, seniority from years of experience, English level from the languages) → return the draft. Goes through the metering decorator, so cost, latency and the daily budget apply.
- The CV text is untrusted data: it goes in `content`, never in `system`, and the prompt says to ignore instructions found inside it. Contact data is dropped before and after the call.
- `AiPurpose` gains `"cv_extraction"`; pricing and logging unchanged.

## API contract
- `POST /profile/import-cv` · `multipart/form-data`, field `file` (PDF, ≤ 5 MB) → `200 CvDraft`. Errors: `400` no file, `413` too large, `415` not a PDF, `422` `cv_no_text` / `cv_too_long` / `ai_refused`, `429` `ai_budget_exceeded`, `502` `ai_provider_error`, `503` `ai_not_configured` (same machine codes as scoring).
- `PUT /profile` / `GET /profile`: new optional fields `education`, `experience`, `languages`, `certifications` (Zod in `packages/shared`).

## Data changes
Migration: `candidate_profiles` gets `education`, `experience`, `languages` (`Jsonb`, default `[]`) and `certifications` (`text[]`, default `{}`). Existing rows keep working. No PDF or contact data is stored.

## Interface (T2–T3)
Tailwind 4 stays. Design tokens in CSS variables (primary blue, greys, radius, shadow) for light and dark. Shell: collapsible left sidebar with icons (Postings, Add posting, Profile), top bar with the language switch, page title with breadcrumb, content in white cards. Posting rows become a table-like card list with badges; the profile page is split into cards (Stack & location, Experience, Education & languages). Import: "Upload CV" card with a notice that the text is sent to the configured AI provider, progress state, then the form filled with the draft and a banner "Review before saving", warnings next to the fields. Mobile: the sidebar becomes a drawer.

## Test plan
- Unit (fakes): `ImportCv` happy path, normalization, contact data removed, each extractor error, AI errors mapped, prompt keeps the CV out of `system`.
- Supertest: endpoint with a PDF generated in the test (text and empty/scanned), size and type errors, profile `PUT/GET` with the new fields, migration applies on a database with an existing profile.
- Web: upload flow with the draft, review banner, save, error messages in both languages, sidebar navigation and drawer.
- E2E: upload a small generated PDF (deterministic AI returns a fixed draft) → review → save → score uses the new profile.
- `pnpm quality` offline; real Groq/Anthropic calls only by hand, with the owner's OK (one CV import ≈ cents; evals ≈ 0.006 USD).

## Acceptance criteria
- A real CV PDF yields a draft whose fields the owner can edit; nothing is stored until saved.
- Scanned or oversized files fail with a clear translated message; the daily budget is respected.
- `score-v4` is built from the extended profile; evals re-run and the result is logged (thresholds unchanged, no regression below the 84.4% baseline).
- Every screen uses the new shell, works at phone width and in both languages.

## Risks
- **Privacy:** CV text goes to the configured AI provider (Groq today); the UI says so before upload. Contact data is never stored.
- **Extraction mistakes or invented data:** the prompt forbids inventing, `warnings` flag missing fields, and review before saving is mandatory.
- **Eval drift** when the prompt changes: re-run with the owner's OK and log the numbers.
- **Look-alike, not a copy:** only the visual style is reproduced; no Metronic code, icons or images are used.
- **Scope:** the restyle touches every screen (T2), kept separate so it can be reviewed on its own.
