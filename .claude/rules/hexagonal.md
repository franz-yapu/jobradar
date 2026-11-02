---
paths: ["apps/api/src/**"]
---
# Hexagonal rules
- domain/ must not import from @nestjs, prisma, aws-sdk or @anthropic-ai/sdk.
- application/ depends only on domain ports.
- New external system = new port in domain + adapter in infrastructure.
