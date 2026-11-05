# SDD-011 – Profile form UX: select styling, autocomplete, cancel and inline validation

**Status:** Implemented (2026-11-05), uncommitted; T1 visual check pending · **Week:** 5 · **Depends on:** SDD-004, SDD-005, SDD-007 · **Numbering:** SDD-010 stays reserved for AWS/Terraform/Grafana (see SDD-004)

## Context
Feedback from first real use of the profile screen:
1. Dropdowns (`Select`) look wrong inside forms.
2. Profile fields are hard to manage: errors only appear as one grouped message after submitting, there is no way to undo edits, and only `Stack` and `Locations` autocomplete.
3. Typing "gi" should suggest Git, GitHub, GitLab… Note: `stack.ts` already contains Git, GitHub, GitHub Actions, GitLab, GitLab CI, so T2 must first reproduce the case before changing the catalog (it may be a visibility/ranking issue, not a missing entry).

## Goal
A profile form where every field helps you fill it (suggestions), tells you at once what is wrong, and can be reverted to the last saved state.

## Scope
**In:** native `Select` styling fix · autocomplete for every free-text/list field · Cancel button with unsaved-changes detection · inline per-field validation on blur · EN/ES texts · tests.
**Out:** replacing native selects with custom listboxes for short lists (seniority, English level, month/year) · server-side suggestion endpoints · storing suggestion history outside the profile · API or DB changes · autosave.

## Tasks
| # | Task | Verification |
|---|---|---|
| T1 | Fix `Select`: reproduce the visual issue in light and dark (popup, chevron overlap, height, focus ring, disabled), adjust `FIELD`/`Select`/`styles.css` only | Screenshot before/after in both themes, widgets test |
| T2 | Autocomplete everywhere: `ChipInput` (certifications) and experience/education/language text fields get suggestions from (a) small curated lists (certifications, job titles, degrees) and (b) values already in the user's saved profile; first reproduce "gi" in Stack | Unit tests for the ranking (`searchOptions` already prefix-first) and component tests |
| T3 | Cancel: `isDirty` = form differs from last saved/loaded profile; "Cancel" resets the form (confirm only when dirty); Save disabled when not dirty; `beforeunload` warning extended from the CV draft to any dirty state | Component tests incl. CV draft case |
| T4 | Inline validation on blur using the existing Zod `SaveProfileSchema` per field path, error text under the field with `aria-invalid`/`aria-describedby`; the grouped message on submit stays as summary and focuses the first invalid field | Component tests, a11y check |

## Domain model
No domain or API change. Frontend only:
- `lib/profile-form.ts`: `isFormDirty(form, saved)` (structural comparison after `toSaveBody`, so empty strings and ordering do not count as edits).
- `lib/profile-errors.ts`: maps Zod issues to `{ [path]: messageKey }`.
- `lib/catalog/*`: curated lists `CERTIFICATIONS`, `JOB_TITLES`, `DEGREES` (small, common spellings, anything else can still be typed).

## Ports & adapters
Not applicable (no backend). Components: `Select` (style only), `ChipInput` and a new text `Autocomplete` input reusing `searchOptions`, `ProfilePage` (dirty/cancel/validation wiring). The profile API client and Zod schemas in `packages/shared` are unchanged.

## API contract / Data changes
None.

## Test plan
- Unit: `isFormDirty`, error mapping, ranking for "gi", "nodejs", accents.
- Component (Vitest + Testing Library): Cancel restores values and asks confirmation only when dirty; Save disabled when clean; blur on an invalid field shows its message and clears it when fixed; suggestions open on typing and select with keyboard.
- Existing `ProfilePage`, `ProfileImport` and `widgets` tests keep passing; E2E first-use path stays green (`pnpm e2e`).
- `pnpm quality` before the PR.

## Acceptance criteria
- Selects render correctly in light and dark at desktop and phone width.
- Typing "gi" in Technologies lists Git, GitHub, GitLab (and related) first.
- Certifications, job title, company/institution/degree show suggestions as you type.
- After editing, Cancel returns the form to the last saved state; leaving the page with unsaved edits warns.
- An invalid field shows its own error after blur; submitting with errors focuses the first one.
- No new dependencies, no `any`, English code and docs.

## Risks
- Native `<select>` popups cannot be fully styled; T1 aims at the closed control and theme colours, not the OS popup. If that is not enough, a custom listbox for those two selects is a follow-up decision.
- Suggestion lists that are too long or too opinionated: keep them short and always allow custom values.
- Dirty detection false positives (normalisation on load): compare through `toSaveBody` and cover with tests.
- Unanswered questions in the brief were resolved with defaults (native selects kept, confirm-only-if-dirty, validate on blur); tell me if you want any of them changed before approving.
