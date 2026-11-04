import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { TEST_PASSWORD } from "./helpers/auth.js";

/**
 * The first account ever created adopts the rows that predate accounts (ADR-0002), so the data of the
 * single-user days is not lost. This file needs an EMPTY users table, so it empties it: it only runs
 * against a database whose name ends in _test.
 */

let app: INestApplication;
let prisma: PrismaService;

const register = (email = `adopt-${randomUUID()}@test.jobradar.local`) =>
  request(app.getHttpServer()).post("/auth/register").send({ email, password: TEST_PASSWORD });

/** What the database looked like before accounts: rows with no owner. */
async function seedLegacyRows(): Promise<{ postingId: string }> {
  const posting = await prisma.posting.create({
    data: {
      title: "Legacy posting",
      company: "Old Co",
      url: `https://legacy.test/${randomUUID()}`,
      source: "getonboard",
      remoteScope: "latam",
      description: "from the single-user days",
    },
  });
  await prisma.candidateProfile.create({
    data: {
      id: "default",
      stack: ["COBOL"],
      seniority: "senior",
      allowedLocations: ["BO"],
      maxEnglishLevel: "B2",
      excludedContractTypes: [],
      summary: "legacy profile",
      version: 3,
    },
  });
  const call = await prisma.aiCall.create({
    data: {
      purpose: "scoring",
      model: "m",
      status: "ok",
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      latencyMs: 1,
      costUsd: 0.02,
    },
  });
  await prisma.postingScore.create({
    data: { postingId: posting.id, aiCallId: call.id, verdict: "fit", reasons: ["legacy"], blockers: [], profileVersion: 3, promptVersion: "score-v3", model: "m" },
  });
  return { postingId: posting.id };
}

async function wipe(): Promise<void> {
  await prisma.postingScore.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(async () => {
  const databaseName = (process.env["DATABASE_URL"] ?? "").split("?")[0]?.split("/").pop() ?? "";
  if (!/(_test|_e2e)$/.test(databaseName)) throw new Error(`Refusing to empty users in "${databaseName}"`);
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await wipe();
  await app.close();
});
beforeEach(wipe);

describe("adoption of legacy data", () => {
  it("the first account gets the legacy postings, profile, scores and AI spend", async () => {
    const { postingId } = await seedLegacyRows();
    const res = await register().expect(201);
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]?.split(";")[0] ?? "";
    const http = (path: string) => request(app.getHttpServer()).get(path).set("Cookie", cookie);

    const list = (await http("/postings")).body as { total: number; items: { title: string; latestScore: { verdict: string } | null }[] };
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ title: "Legacy posting", latestScore: { verdict: "fit" } });
    expect((await http("/profile")).body).toMatchObject({ stack: ["COBOL"], version: 3 });
    expect((await http(`/postings/${postingId}/score`)).status).toBe(200);
    expect((await http("/ai/usage")).body).toMatchObject({ calls: expect.any(Number) });

    expect(await prisma.posting.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.candidateProfile.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.postingScore.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.aiCall.count({ where: { userId: null } })).toBe(0);
  });

  it("only the first account adopts: the second one starts empty and the orphans stay orphans", async () => {
    await register().expect(201);
    await seedLegacyRows(); // late orphan rows, after an account already exists

    const second = await register().expect(201);
    const cookie = (second.headers["set-cookie"] as unknown as string[])[0]?.split(";")[0] ?? "";
    const http = (path: string) => request(app.getHttpServer()).get(path).set("Cookie", cookie);

    expect((await http("/postings")).body.total).toBe(0);
    expect((await http("/profile")).status).toBe(404);
    expect(await prisma.posting.count({ where: { userId: null } })).toBe(1);
  });

  it("a registration that fails does not consume the adoption", async () => {
    await seedLegacyRows();
    await request(app.getHttpServer()).post("/auth/register").send({ email: "weak@test.jobradar.local", password: "short" }).expect(400);
    expect(await prisma.posting.count({ where: { userId: null } })).toBe(1);

    const first = await register().expect(201);
    const owner = await prisma.posting.findFirstOrThrow();
    expect(owner.userId).toBe(first.body.id);
  });

  it("with no legacy data the first account simply starts empty", async () => {
    const res = await register().expect(201);
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]?.split(";")[0] ?? "";
    expect((await request(app.getHttpServer()).get("/postings").set("Cookie", cookie)).body.total).toBe(0);
  });

  it("simultaneous first registrations give the data to exactly one account", async () => {
    await seedLegacyRows();
    const results = await Promise.all(Array.from({ length: 5 }, () => register()));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);

    const owners = await prisma.posting.findMany({ select: { userId: true } });
    expect(owners).toHaveLength(1);
    expect(owners[0]?.userId).not.toBeNull();
    expect(results.map((r) => r.body.id as string)).toContain(owners[0]?.userId);
    // the profile moved with it, and nothing was duplicated
    expect(await prisma.candidateProfile.count({ where: { userId: owners[0]?.userId ?? "" } })).toBe(1);
    expect(await prisma.candidateProfile.count()).toBe(1);
  });
});
