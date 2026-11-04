import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AiNotConfiguredError, AiProviderError, AiRefusalError } from "../src/ai/domain/ai-provider.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

process.env["AI_DAILY_BUDGET_USD"] = "0.05";

const profile = {
  stack: ["TypeScript"], seniority: "senior", allowedLocations: ["BO", "latam"], maxEnglishLevel: "B2",
  excludedContractTypes: ["temporary"], summary: "Full stack",
};
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let agent: Agent;
const http = () => agent;

async function createPosting(): Promise<string> {
  const res = await http().post("/postings").send({
    title: "Backend", company: "Acme", url: `https://x.test/${Math.random()}`, source: "t",
    remoteScope: "latam", description: "Node.js, English C2 required",
  });
  return res.body.id as string;
}

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  agent = await loginAgent(app);
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
  await prisma.candidateProfile.deleteMany();
  fake.requests.length = 0;
});

describe("POST /postings/:id/score", () => {
  it("stores and returns the score, linked to its ai_calls row", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willReturn({ verdict: "maybe", reasons: ["Needs checking"], blockers: [] }, { costUsd: 0.01 });

    const res = await http().post(`/postings/${id}/score`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      postingId: id, verdict: "maybe", reasons: ["Needs checking"], blockers: [],
      profileVersion: 1, promptVersion: "score-v4", model: "fake-model",
    });
    const call = await prisma.aiCall.findFirstOrThrow();
    expect(res.body.aiCallId).toBe(call.id);
    expect(await prisma.postingScore.count()).toBe(1);
  });

  it("forces reject when the model reports blockers", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willReturn({ verdict: "fit", reasons: [], blockers: [{ type: "english", evidence: "English C2 required" }] });
    const res = await http().post(`/postings/${id}/score`);
    expect(res.body).toMatchObject({ verdict: "reject", blockers: [{ type: "english", evidence: "English C2 required" }] });
  });

  it("keeps history and GET returns the latest", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willReturn({ verdict: "maybe", reasons: [], blockers: [] }).willReturn({ verdict: "fit", reasons: ["ok"], blockers: [] });
    await http().post(`/postings/${id}/score`);
    const second = await http().post(`/postings/${id}/score`);

    expect(await prisma.postingScore.count()).toBe(2);
    const latest = await http().get(`/postings/${id}/score`);
    expect(latest.status).toBe(200);
    expect(latest.body).toEqual(second.body);
  });

  it("400 on a malformed id, 404 on an unknown posting", async () => {
    expect((await http().post("/postings/nope/score")).status).toBe(400);
    expect((await http().post(`/postings/${UNKNOWN}/score`)).status).toBe(404);
    expect(fake.requests).toHaveLength(0);
  });

  it("422 profile_not_configured without calling the provider", async () => {
    const id = await createPosting();
    const res = await http().post(`/postings/${id}/score`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("profile_not_configured");
    expect(fake.requests).toHaveLength(0);
  });

  it("422 ai_refused", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willFail(new AiRefusalError("policy"));
    const res = await http().post(`/postings/${id}/score`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("ai_refused");
    expect(await prisma.postingScore.count()).toBe(0);
  });

  it("429 ai_budget_exceeded once the day's budget is spent, with no provider call", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willReturn({ verdict: "maybe", reasons: [], blockers: [] }, { costUsd: 0.06 });
    expect((await http().post(`/postings/${id}/score`)).status).toBe(201);

    const res = await http().post(`/postings/${id}/score`);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("ai_budget_exceeded");
    expect(fake.requests).toHaveLength(1);
  });

  it("502 ai_provider_error", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willFail(new AiProviderError("upstream down"));
    const res = await http().post(`/postings/${id}/score`);
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("ai_provider_error");
  });

  it("503 ai_not_configured", async () => {
    await http().put("/profile").send(profile);
    const id = await createPosting();
    fake.willFail(new AiNotConfiguredError("no key"));
    const res = await http().post(`/postings/${id}/score`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("ai_not_configured");
  });
});

describe("GET /postings/:id/score", () => {
  it("404 for an unknown posting and for a posting never scored", async () => {
    expect((await http().get(`/postings/${UNKNOWN}/score`)).status).toBe(404);
    const id = await createPosting();
    expect((await http().get(`/postings/${id}/score`)).status).toBe(404);
  });

  it("400 on a malformed id", async () => {
    expect((await http().get("/postings/nope/score")).status).toBe(400);
  });
});

describe("scoring uses the profile background", () => {
  it("sends the experience and education saved with the profile to the model", async () => {
    await http().put("/profile").send({
      ...profile,
      education: [{ institution: "UMSA", degree: "BSc", field: "Informatics" }],
      experience: [{ company: "Acme", role: "Backend Developer", startYear: 2020, current: true, highlights: ["Built the billing API"] }],
    }).expect(200);
    const id = await createPosting();
    fake.willReturn({ verdict: "maybe", reasons: ["Needs checking"], blockers: [] });

    await http().post(`/postings/${id}/score`).expect(201);

    const system = fake.requests[0]?.system ?? "";
    expect(system).toContain("Backend Developer");
    expect(system).toContain("Acme");
    expect(system).toContain("Built the billing API");
    expect(system).toContain("BSc");
  });

  it("keeps the prompt without a background section for a profile without one", async () => {
    await http().put("/profile").send(profile).expect(200);
    const id = await createPosting();
    fake.willReturn({ verdict: "maybe", reasons: ["Needs checking"], blockers: [] });

    await http().post(`/postings/${id}/score`).expect(201);
    expect(fake.requests[0]?.system).not.toContain("background");
  });
});
