---
paths: ["apps/**/src/**"]
---
# Testing rules
- New use case → unit test with in-memory adapters.
- New endpoint → integration test with Supertest.
- Bug fix → add a failing test first.
