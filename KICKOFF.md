# KICKOFF – Cómo arrancar JobRadar en tu máquina

## 0. Requisitos
- Node 22+, pnpm (`npm i -g pnpm`), Docker, Git, Claude Code.

## 1. Crear el repo
```bash
unzip jobradar.zip && cd jobradar
git init && git add . && git commit -m "docs: project scaffold, PRD, ADR-0001, SDD-001"
gh repo create franz-yapu/jobradar --public --source=. --push
```

## 2. Levantar servicios
```bash
cp .env.example .env
docker compose up -d        # Postgres :5432 · n8n :5678 · Grafana :3001
```

## 3. Semana 1 con Claude Code
Abre `claude` en la carpeta y pega este prompt:

> Read CLAUDE.md, docs/product/PRD.md, docs/adr/ADR-0001 and docs/sdd/SDD-001.
> Use the task-brief skill for SDD-001 and show me the brief. Wait for my OK.
> Then implement SDD-001: pnpm workspaces monorepo, NestJS app in apps/api with
> hexagonal structure (postings module: domain/application/infrastructure),
> Prisma + PostgreSQL, Zod schemas in packages/shared, Swagger at /docs,
> /health endpoint, unit + Supertest integration tests, and a root `pnpm quality`
> script (lint + typecheck + test). Commit in small Conventional Commits.

Revisa cada diff antes de aceptar. Al terminar:
```bash
pnpm quality && git push
```
Marca la semana 1 en el Roadmap del README.

## 4. Siguientes SDD (pídelos con la skill write-sdd)
| SDD | Semana | Contenido |
|---|---|---|
| SDD-002 | 2 | Agente de IA: puerto `AiProvider`, adapter Claude con tool use, scoring ✅/⚠️/❌, log de tokens/costo, evals con promptfoo |
| SDD-003 | 3 | n8n: workflow 1 (RSS de Get on Board → POST /postings), workflow 2 (resumen diario → Telegram). Exportar JSON a n8n/workflows |
| SDD-004 | 4 | Dashboard React + Vite: lista, filtros, veredicto, respuestas sugeridas. E2E con Playwright |
| SDD-005 | 4 | AWS con Terraform: S3, SQS, Lambda del worker de IA, RDS. Grafana con métricas de IA |

## 5. Para que sirva de evidencia
- Capturas o GIF en el README (panel, workflow de n8n, Grafana).
- Demo en tu VPS con Coolify + Cloudflare.
- AWS: usa el free tier y destruye recursos con `terraform destroy` cuando no los uses.
- Pon el enlace del repo en tu CV y en los formularios (n8n, AWS, agentes de IA).
