import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { signWorkerRequest } from "@jobradar/shared/worker-signature";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import type { ScoringJobMessage } from "../src/scoring/domain/scoring-batch.js";
import { SCORING_QUEUE, type ScoringQueue } from "../src/scoring/domain/scoring-queue.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

const SECRET = "t".repeat(32);
process.env["WORKER_SECRET"] = SECRET;
process.env["AI_DAILY_BUDGET_USD"] = "5";

const profile = {
  stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO"], maxEnglishLevel: "B2",
  excludedContractTypes: [], summary: "Full stack",
};
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const pathOf = (jobId: string) => `/internal/scoring/jobs/${jobId}/process`;

/** Captures what would go to SQS, so the test plays the worker's part itself. */
class CapturingQueue implements ScoringQueue {
  sent: ScoringJobMessage[] = [];
  async enqueue(jobs: readonly ScoringJobMessage[]): Promise<void> {
    this.sent.push(...jobs);
  }
}

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let agent: Agent;
const queue = new CapturingQueue();

function signed(path: string, secret = SECRET, at = Date.now()) {
  const { timestamp, signature } = signWorkerRequest({ secret, method: "POST", path }, at);
  return { "x-worker-timestamp": timestamp, "x-worker-signature": signature };
}
const call = (path: string, headers: Record<string, string> = {}) => request(app.getHttpServer()).post(path).set(headers);

async function queueOneJob(): Promise<{ batchId: string; jobId: string }> {
  await agent.put("/profile").send(profile);
  await agent.post("/postings").send({ title: "Backend", company: "Acme", url: "https://x.test/1", source: "t", remoteScope: "latam", description: "Node" }).expect(201);
  const res = await agent.post("/scoring/batches").send({}).expect(202);
  const [message] = queue.sent;
  if (!message) throw new Error("nothing was queued");
  return { batchId: res.body.id as string, jobId: message.jobId };
}

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (
    await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_INNER_PROVIDER).useValue(fake)
      .overrideProvider(SCORING_QUEUE).useValue(queue)
      .compile()
  ).createNestApplication();
  await app.init();
  agent = await loginAgent(app);
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
  queue.sent = [];
});

describe("POST /internal/scoring/jobs/:id/process", () => {
  it("refuses a call without a signature, with a wrong one, with a stale one and for another path", async () => {
    const { jobId } = await queueOneJob();
    await call(pathOf(jobId)).expect(401);
    await call(pathOf(jobId), signed(pathOf(jobId), "x".repeat(32))).expect(401);
    await call(pathOf(jobId), signed(pathOf(jobId), SECRET, Date.now() - 10 * 60 * 1000)).expect(401);
    await call(pathOf(jobId), signed(pathOf(UNKNOWN))).expect(401);
    expect(fake.requests).toHaveLength(0);
    expect((await prisma.scoringJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("queued");
  });

  it("is not reachable with a user session alone", async () => {
    const { jobId } = await queueOneJob();
    await agent.post(pathOf(jobId)).expect(401);
  });

  it("scores the job for a valid signature and the batch shows it done", async () => {
    const { batchId, jobId } = await queueOneJob();
    fake.willReturn({ verdict: "fit", reasons: ["ok"], blockers: [] });
    await call(pathOf(jobId), signed(pathOf(jobId))).expect(204);
    const progress = await agent.get(`/scoring/batches/${batchId}`).expect(200);
    expect(progress.body).toMatchObject({ requested: 1, done: 1, failed: 0, queued: 0 });
    expect(await prisma.postingScore.count()).toBe(1);
  });

  it("scores nothing twice when the message is delivered again", async () => {
    const { jobId } = await queueOneJob();
    fake.willReturn({ verdict: "fit", reasons: [], blockers: [] });
    await call(pathOf(jobId), signed(pathOf(jobId))).expect(204);
    await call(pathOf(jobId), signed(pathOf(jobId))).expect(204);
    expect(fake.requests).toHaveLength(1);
  });

  it("answers 404 for a signed call about an unknown job and 400 for a malformed id", async () => {
    await call(pathOf(UNKNOWN), signed(pathOf(UNKNOWN))).expect(404);
    await call("/internal/scoring/jobs/nope/process", signed("/internal/scoring/jobs/nope/process")).expect(400);
  });
});
