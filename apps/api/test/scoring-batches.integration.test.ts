import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { BudgetExceededError } from "../src/ai/domain/ai-provider.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { SCORING_QUEUE } from "../src/scoring/domain/scoring-queue.js";
import type { InProcessScoringQueue } from "../src/scoring/infrastructure/in-process-scoring-queue.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

process.env["AI_DAILY_BUDGET_USD"] = "5";

const profile = {
  stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO", "latam"], maxEnglishLevel: "B2",
  excludedContractTypes: ["temporary"], summary: "Full stack",
};
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let agent: Agent;
let other: Agent;

const settle = () => (app.get(SCORING_QUEUE) as InProcessScoringQueue).idle();

async function createPostings(http: Agent, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await http.post("/postings").send({
      title: `Backend ${i}`, company: "Acme", url: `https://x.test/${Math.random()}`, source: "t",
      remoteScope: "latam", description: "Node.js",
    }).expect(201);
  }
}

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  agent = await loginAgent(app);
  other = await loginAgent(app);
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});
beforeEach(async () => {
  await prisma.scoringBatch.deleteMany();
  await prisma.postingScore.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.candidateProfile.deleteMany();
  fake.requests.length = 0;
});

describe("POST /scoring/batches", () => {
  it("requires a session", async () => {
    const { default: request } = await import("supertest");
    await request(app.getHttpServer()).post("/scoring/batches").send({}).expect(401);
  });

  it("answers 422 profile_not_configured without a profile", async () => {
    await createPostings(agent, 1);
    const res = await agent.post("/scoring/batches").send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("profile_not_configured");
  });

  it("answers 200 with requested 0 when there is nothing to score", async () => {
    await agent.put("/profile").send(profile);
    const res = await agent.post("/scoring/batches").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: null, requested: 0 });
  });

  it("rejects a limit out of range", async () => {
    await agent.put("/profile").send(profile);
    await agent.post("/scoring/batches").send({ limit: 11 }).expect(400);
    await agent.post("/scoring/batches").send({ limit: 0 }).expect(400);
  });

  it("queues the newest unscored postings, scores them in the background and reports progress", async () => {
    await agent.put("/profile").send(profile);
    await createPostings(agent, 3);
    for (let i = 0; i < 2; i++) fake.willReturn({ verdict: "fit", reasons: ["ok"], blockers: [] });

    const res = await agent.post("/scoring/batches").send({ limit: 2 });
    expect(res.status).toBe(202);
    expect(res.body.requested).toBe(2);
    await settle();

    const progress = await agent.get(`/scoring/batches/${res.body.id}`).expect(200);
    expect(progress.body).toMatchObject({ id: res.body.id, requested: 2, queued: 0, done: 2, failed: 0, errors: [] });
    expect(await prisma.postingScore.count()).toBe(2);
    expect(fake.requests).toHaveLength(2);

    // the next batch only takes what is still unscored
    fake.willReturn({ verdict: "maybe", reasons: [], blockers: [] });
    const next = await agent.post("/scoring/batches").send({});
    expect(next.body.requested).toBe(1);
    await settle();
  });

  it("reports a budget stop on the batch and makes no further AI calls", async () => {
    await agent.put("/profile").send(profile);
    await createPostings(agent, 3);
    fake.willFail(new BudgetExceededError(5, 5));

    const res = await agent.post("/scoring/batches").send({});
    await settle();
    const progress = await agent.get(`/scoring/batches/${res.body.id}`).expect(200);
    expect(progress.body).toMatchObject({ requested: 3, done: 0, failed: 3, queued: 0 });
    expect(progress.body.errors.every((e: { code: string }) => e.code === "ai_budget_exceeded")).toBe(true);
    expect(fake.requests).toHaveLength(1);
  });
});

describe("GET /scoring/batches/:id", () => {
  it("answers 404 for another account's batch, an unknown one, and 400 for a malformed id", async () => {
    await agent.put("/profile").send(profile);
    await createPostings(agent, 1);
    fake.willReturn({ verdict: "fit", reasons: [], blockers: [] });
    const { body } = await agent.post("/scoring/batches").send({});
    await settle();

    await other.get(`/scoring/batches/${body.id}`).expect(404);
    await agent.get(`/scoring/batches/${UNKNOWN}`).expect(404);
    await agent.get("/scoring/batches/nope").expect(400);
  });
});
