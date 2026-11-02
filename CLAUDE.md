# CLAUDE.md – JobRadar

## Source of truth
- Read `docs/product/PRD.md` and the relevant `docs/sdd/SDD-*.md` BEFORE implementing anything.
- No code without an approved SDD. Flow: ticket → task-brief → SDD → approval → implement → tests → PR.
- Architecture decisions go in `docs/adr/`. Small decisions go in `docs/decisions/LOG.md`.

## Architecture (see ADR-0001)
- `apps/api/src/<module>/domain` – entities, value objects, ports (interfaces). NO framework imports.
- `apps/api/src/<module>/application` – use cases. Depends only on domain.
- `apps/api/src/<module>/infrastructure` – adapters: Prisma repos, HTTP controllers, AI providers, SQS.
- Dependencies point inward. Never import infrastructure from domain/application.

## Conventions
- TypeScript strict. No `any`. Validate external input with Zod (schemas in `packages/shared`).
- Code, commits and docs in English. Conventional Commits (`feat:`, `fix:`, `docs:`...).
- Every use case has unit tests. Every endpoint has an integration test.
- AI calls go through the `AiProvider` port. Log tokens, latency and cost for each call.

## Commands
- `pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm typecheck`
- `pnpm quality` = lint + typecheck + test (run before every PR)

## Do not
- Commit secrets. Use `.env` (see `.env.example`).
- Edit generated files or `prisma/migrations` by hand.
