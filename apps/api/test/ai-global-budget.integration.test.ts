import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { SCORING_QUEUE } from "../src/scoring/domain/scoring-queue.js";
import type { InProcessScoringQueue } from "../src/scoring/infrastructure/in-process-scoring-queue.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

// Each account may spend 5 USD a day, but all accounts together only 0.03: open registration cannot multiply the cap.
process.env["AI_DAILY_BUDGET_USD"] = "5";
process.env["AI_GLOBAL_DAILY_BUDGET_USD"] = "0.03";

const profile = {
  stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO"], maxEnglishLevel: "B2",
  excludedContractTypes: [], summary: "Full stack",
};
const verdict = { verdict: "fit", reasons: ["ok"], blockers: [] };

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let a: Agent;
let b: Agent;

async function postingOf(agent: Agent): Promise<string> {
  const res = await agent.post("/postings").send({
    title: "Backend", company: "Acme", url: `https://x.test/${Math.random()}`, source: "t", remoteScope: "latam", description: "Node",
  });
  return res.body.id as string;
}

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  a = await loginAgent(app);
  b = await loginAgent(app);
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});
beforeEach(async () => {
  await prisma.postingScore.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.posting.deleteMany();
  fake.requests.length = 0;
});

describe("global daily AI budget", () => {
  it("two accounts crossing the global cap: the next call answers 429 and never reaches the provider", async () => {
    await a.put("/profile").send(profile);
    await b.put("/profile").send(profile);
    const [pa, pb, pa2] = [await postingOf(a), await postingOf(b), await postingOf(a)];

    fake.willReturn(verdict, { costUsd: 0.02 });
    await a.post(`/postings/${pa}/score`).expect(201); // global 0.02 < 0.03
    fake.willReturn(verdict, { costUsd: 0.02 });
    await b.post(`/postings/${pb}/score`).expect(201); // global 0.04 now

    const blocked = await a.post(`/postings/${pa2}/score`);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("ai_budget_exceeded");
    expect(fake.requests).toHaveLength(2);

    const row = await prisma.aiCall.findFirstOrThrow({ where: { status: "budget_blocked" } });
    expect(row.detail).toMatch(/global/i);
    // the accounts' own usage stays far below their personal cap
    const usage = await a.get("/ai/usage").expect(200);
    expect(usage.body.spentUsd).toBeLessThan(usage.body.budgetUsd);
  });

  it("also stops background batch jobs, failing them with the budget code", async () => {
    await a.put("/profile").send(profile);
    await postingOf(a);
    await prisma.aiCall.create({
      data: { purpose: "scoring", model: "m", status: "ok", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0.05 },
    });
    const res = await a.post("/scoring/batches").send({}).expect(202);
    await (app.get(SCORING_QUEUE) as InProcessScoringQueue).idle();
    const progress = await a.get(`/scoring/batches/${res.body.id as string}`).expect(200);
    expect(progress.body.errors[0]?.code).toBe("ai_budget_exceeded");
    expect(fake.requests).toHaveLength(0);
  });
});
