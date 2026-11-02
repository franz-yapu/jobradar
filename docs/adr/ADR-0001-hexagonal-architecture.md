# ADR-0001 – Hexagonal architecture for the API

**Status:** Accepted

## Context
The API integrates several external systems (PostgreSQL, AI providers, SQS, n8n). They may change.

## Decision
Use hexagonal architecture (ports & adapters) inside a NestJS modular monolith.
Domain and application layers have no framework or SDK imports.

## Alternatives considered
- Classic NestJS layered (controller/service/repository): faster start, but couples logic to Prisma and the AI SDK.
- Microservices: unnecessary complexity for v1.

## Consequences
+ AI provider can be swapped (Claude / OpenAI / Gemini) by adding an adapter.
+ Use cases are unit-testable with in-memory adapters.
− More files and boilerplate per feature.
