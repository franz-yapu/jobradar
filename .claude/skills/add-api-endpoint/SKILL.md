---
name: add-api-endpoint
description: Add a REST endpoint following hexagonal architecture. Use when an SDD requires a new endpoint.
---
1. Zod schema in packages/shared.  2. Use case in application/.  3. Controller in infrastructure/http.
4. Unit test for the use case + Supertest integration test.  5. Update OpenAPI (Swagger) decorators.
6. Run `pnpm quality`.
