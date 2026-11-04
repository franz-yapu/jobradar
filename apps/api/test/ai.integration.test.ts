import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AI_PROVIDER, BudgetExceededError, type AiProvider } from "../src/ai/domain/ai-provider.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { currentUserId, loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

process.env["AI_DAILY_BUDGET_USD"] = "0.05";

const request = (userId: string) => ({ userId, purpose: "scoring" as const, system: "s", content: "c", schema: z.object({ ok: z.boolean() }) });
const today = () => new Date().toISOString().slice(0, 10);

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let provider: AiProvider;
let agent: Agent;
let userId: string;
const http = () => agent;
const req = () => request(userId);

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  agent = await loginAgent(app);
  userId = await currentUserId(agent);
  prisma = app.get(PrismaService);
  provider = app.get<AiProvider>(AI_PROVIDER);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});
beforeEach(async () => {
  await prisma.aiCall.deleteMany();
  fake.requests.length = 0;
});

describe("GET /ai/usage", () => {
  it("reports zeros and the budget on a quiet day", async () => {
    const res = await http().get("/ai/usage");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: today(), spentUsd: 0, budgetUsd: 0.05, calls: 0, inputTokens: 0, outputTokens: 0 });
  });

  it("ignores rows from previous days", async () => {
    await prisma.aiCall.create({
      data: { purpose: "scoring", model: "m", status: "ok", inputTokens: 5, outputTokens: 5, cacheReadTokens: 0,
        cacheWriteTokens: 0, latencyMs: 1, costUsd: 9, createdAt: new Date(Date.now() - 36 * 3600 * 1000) },
    });
    expect((await http().get("/ai/usage")).body).toMatchObject({ spentUsd: 0, calls: 0 });
  });
});

describe("metered provider with a real database", () => {
  it("logs each call and exposes the totals", async () => {
    fake.willReturn({ ok: true }, { inputTokens: 100, outputTokens: 20, costUsd: 0.03 });
    await provider.generateStructured(req());

    const rows = await prisma.aiCall.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purpose: "scoring", model: "fake-model", status: "ok", inputTokens: 100, outputTokens: 20 });
    expect(Number(rows[0]?.costUsd)).toBe(0.03);
    expect(rows[0]?.latencyMs).toBeGreaterThanOrEqual(0);

    expect((await http().get("/ai/usage")).body).toMatchObject({ spentUsd: 0.03, calls: 1, inputTokens: 100, outputTokens: 20 });
  });

  it("blocks once the budget is spent and does not reach the provider", async () => {
    fake.willReturn({ ok: true }, { costUsd: 0.03 }).willReturn({ ok: true }, { costUsd: 0.03 });
    await provider.generateStructured(req());
    await provider.generateStructured(req());
    await expect(provider.generateStructured(req())).rejects.toBeInstanceOf(BudgetExceededError);

    expect(fake.requests).toHaveLength(2);
    expect(await prisma.aiCall.count({ where: { status: "budget_blocked" } })).toBe(1);
    expect((await http().get("/ai/usage")).body).toMatchObject({ spentUsd: 0.06, calls: 2 });
  });

  it("logs failed calls too", async () => {
    fake.willFail(new Error("boom"));
    await expect(provider.generateStructured(req())).rejects.toThrow("boom");
    const [row] = await prisma.aiCall.findMany();
    expect(row).toMatchObject({ status: "error", inputTokens: 0 });
    expect(row?.detail).toContain("boom");
  });
});

describe("the AI budget and the call log are per account", () => {
  it("one account spending its budget does not block or count for another", async () => {
    const other = await loginAgent(app);
    const otherId = await currentUserId(other);

    fake.willReturn({ ok: true }, { costUsd: 0.03 }).willReturn({ ok: true }, { costUsd: 0.03 });
    await provider.generateStructured(req());
    await provider.generateStructured(req());
    await expect(provider.generateStructured(req())).rejects.toBeInstanceOf(BudgetExceededError);

    // the other account still has its whole budget and sees none of this spend
    expect((await other.get("/ai/usage")).body).toMatchObject({ spentUsd: 0, calls: 0 });
    fake.willReturn({ ok: true }, { costUsd: 0.03 });
    await expect(provider.generateStructured(request(otherId))).resolves.toBeDefined();
    expect((await other.get("/ai/usage")).body).toMatchObject({ spentUsd: 0.03, calls: 1 });
    expect((await http().get("/ai/usage")).body).toMatchObject({ spentUsd: 0.06, calls: 2 });

    // each row belongs to the account that made the call
    expect(await prisma.aiCall.count({ where: { userId } })).toBe(3); // 2 ok + 1 blocked
    expect(await prisma.aiCall.count({ where: { userId: otherId } })).toBe(1);
  });
});
