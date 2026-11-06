-- Read-only role for Grafana (SDD-010 T5). SQL-only migration: Prisma cannot model roles or grants.
-- The role is created NOLOGIN and holds no secret; `pnpm grafana:setup` gives it a password (never stored in git).
-- It sees the AI metrics columns of ai_calls only: no `detail` (provider error text) and no `userId`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafana_reader') THEN
    CREATE ROLE grafana_reader NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO grafana_reader;

GRANT SELECT (
  "id", "purpose", "model", "status", "inputTokens", "outputTokens",
  "cacheReadTokens", "cacheWriteTokens", "latencyMs", "costUsd", "createdAt"
) ON "ai_calls" TO grafana_reader;
