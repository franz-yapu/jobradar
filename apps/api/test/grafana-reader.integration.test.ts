import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";

/**
 * The read-only role Grafana connects with (migration 20261106140000). The test assumes it with SET LOCAL ROLE
 * inside a transaction, so it needs no password and leaves nothing behind.
 */
let prisma: PrismaService;

beforeAll(async () => {
  prisma = new PrismaService(process.env["DATABASE_URL"] ?? "");
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Runs one statement as grafana_reader; the transaction always rolls back. */
async function asReader(sql: string): Promise<unknown> {
  const rollback = new Error("rollback");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE grafana_reader");
      await tx.$queryRawUnsafe(sql);
      throw rollback;
    });
  } catch (error) {
    return error === rollback ? "ok" : error;
  }
  return "ok";
}

const denied = (result: unknown) => expect(String(result)).toMatch(/permission denied/i);

describe("grafana_reader", () => {
  it("reads the AI metric columns", async () => {
    expect(
      await asReader(
        `SELECT purpose, model, status, "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "latencyMs", "costUsd", "createdAt" FROM ai_calls LIMIT 1`,
      ),
    ).toBe("ok");
  });

  it("cannot read who spent it or the provider's error text", async () => {
    denied(await asReader(`SELECT "userId" FROM ai_calls`));
    denied(await asReader(`SELECT detail FROM ai_calls`));
    denied(await asReader(`SELECT * FROM ai_calls`));
  });

  it("cannot read any other table", async () => {
    for (const table of ["users", "sessions", "api_tokens", "postings", "posting_scores", "candidate_profiles"]) {
      denied(await asReader(`SELECT 1 FROM ${table} LIMIT 1`));
    }
  });

  it("cannot write", async () => {
    denied(await asReader(`DELETE FROM ai_calls`));
    denied(await asReader(`UPDATE ai_calls SET "costUsd" = 0`));
    denied(await asReader(`INSERT INTO ai_calls (id) VALUES (gen_random_uuid())`));
  });
});
