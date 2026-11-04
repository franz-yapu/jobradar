import { randomUUID } from "node:crypto";
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

/**
 * The shared catalog (ADR-0004): everybody reads it, only a verified administrator writes it, and everything
 * personal (private postings, profiles, verdicts) stays personal. Three real accounts through the real stack.
 */

const ADMIN_EMAIL = `admin-${randomUUID()}@test.jobradar.local`;
const job = (url: string, title = "Shared job") => ({ title, company: "Acme", url, source: "getonboard", remoteScope: "latam", description: "Node.js" });
const PROFILE = { stack: ["Node.js"], seniority: "senior", allowedLocations: ["BO", "latam"], maxEnglishLevel: "B2", excludedContractTypes: [], summary: "Backend" };
const SCORE = { verdict: "fit", reasons: ["Matches the stack"], blockers: [] };

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let admin: Agent;
let a: Agent;
let b: Agent;
const previousAdmins = process.env["ADMIN_EMAILS"];

beforeAll(async () => {
  process.env["ADMIN_EMAILS"] = ADMIN_EMAIL;
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile()).createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  admin = await loginAgent(app, ADMIN_EMAIL);
  a = await loginAgent(app);
  b = await loginAgent(app);
});
afterAll(async () => {
  await prisma.posting.deleteMany({ where: { userId: null } });
  await removeTestUsers(app);
  await app.close();
  if (previousAdmins === undefined) Reflect.deleteProperty(process.env, "ADMIN_EMAILS");
  else process.env["ADMIN_EMAILS"] = previousAdmins;
});
beforeEach(async () => {
  await prisma.postingScore.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.candidateProfile.deleteMany();
  fake.requests.length = 0;
});

/** What Google sign-in does for the administrator: their email becomes verified. */
const verifyAdminEmail = () => prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { emailVerifiedAt: new Date() } });

describe("who is an administrator", () => {
  it("is nobody by default, and an unverified email never counts even when it is listed", async () => {
    expect((await admin.get("/auth/me")).body).toMatchObject({ isAdmin: false });
    await admin.post("/postings").send({ ...job("https://acme.com/1"), scope: "catalog" }).expect(403);
  });

  it("is a listed email once an identity provider verified it", async () => {
    await verifyAdminEmail();
    expect((await admin.get("/auth/me")).body).toMatchObject({ isAdmin: true });
    expect((await a.get("/auth/me")).body).toMatchObject({ isAdmin: false });
  });
});

describe("writing the catalog", () => {
  beforeEach(verifyAdminEmail);

  it("an administrator publishes to the catalog; the response says so and hides the owner", async () => {
    const res = await admin.post("/postings").send({ ...job("https://acme.com/1"), scope: "catalog" }).expect(201);
    expect(res.body).toMatchObject({ scope: "catalog", title: "Shared job" });
    expect(res.body).not.toHaveProperty("userId");
    expect(res.body).not.toHaveProperty("catalogKey");
  });

  it("a normal account cannot, and nothing is stored", async () => {
    const res = await a.post("/postings").send({ ...job("https://acme.com/1"), scope: "catalog" }).expect(403);
    expect(res.body).toMatchObject({ error: "not_admin" });
    expect(await prisma.posting.count()).toBe(0);
  });

  it("the same url twice in the catalog is a conflict, even with tracking parameters", async () => {
    await admin.post("/postings").send({ ...job("https://acme.com/1"), scope: "catalog" }).expect(201);
    await admin.post("/postings").send({ ...job("https://acme.com/1?utm_source=x"), scope: "catalog" }).expect(409);
  });

  it("without scope an administrator's posting stays private", async () => {
    const res = await admin.post("/postings").send(job("https://acme.com/own")).expect(201);
    expect(res.body.scope).toBe("mine");
    expect((await a.get("/postings")).body.total).toBe(0);
  });

  it("an administrator's API token can publish too, an ordinary account's token cannot", async () => {
    const adminToken = ((await admin.post("/auth/tokens").send({ name: "n8n" }).expect(201)).body as { token: string }).token;
    const userToken = ((await a.post("/auth/tokens").send({ name: "n8n" }).expect(201)).body as { token: string }).token;
    const send = (token: string, url: string) =>
      request(app.getHttpServer()).post("/postings").set("Authorization", `Bearer ${token}`).send({ ...job(url), scope: "catalog" });
    await send(adminToken, "https://acme.com/by-token").expect(201);
    await send(userToken, "https://acme.com/by-user-token").expect(403);
    expect((await b.get("/postings?scope=catalog")).body.total).toBe(1);
  });
});

describe("reading", () => {
  beforeEach(async () => {
    await verifyAdminEmail();
    await admin.post("/postings").send({ ...job("https://acme.com/shared-1", "Shared one"), scope: "catalog" }).expect(201);
  });

  it("every account sees the catalog plus only its own private postings", async () => {
    await a.post("/postings").send(job("https://acme.com/a-private", "A private")).expect(201);
    await b.post("/postings").send(job("https://acme.com/b-private", "B private")).expect(201);

    const titles = async (agent: Agent, query = "") =>
      ((await agent.get(`/postings${query}`)).body as { items: { title: string }[] }).items.map((p) => p.title).sort();
    expect(await titles(a)).toEqual(["A private", "Shared one"]);
    expect(await titles(b)).toEqual(["B private", "Shared one"]);
    expect(await titles(a, "?scope=catalog")).toEqual(["Shared one"]);
    expect(await titles(a, "?scope=mine")).toEqual(["A private"]);
    expect(await titles(b, "?q=private&verdict=unscored")).toEqual(["B private"]);
  });

  it("a brand-new account with nothing of its own sees the catalog straight away", async () => {
    const fresh = await loginAgent(app);
    const list = (await fresh.get("/postings")).body as { total: number; items: { scope: string }[] };
    expect(list.total).toBe(1);
    expect(list.items[0]?.scope).toBe("catalog");
  });

  it("a private posting of another account stays invisible by id", async () => {
    const secret = (await a.post("/postings").send(job("https://acme.com/a-secret")).expect(201)).body as { id: string };
    await b.post(`/postings/${secret.id}/score`).expect(404);
    await b.get(`/postings/${secret.id}/score`).expect(404);
  });
});

describe("personal verdicts on a shared posting", () => {
  it("each account scores against its own profile and never sees the other's verdict", async () => {
    await verifyAdminEmail();
    const shared = (await admin.post("/postings").send({ ...job("https://acme.com/shared-2"), scope: "catalog" }).expect(201)).body as { id: string };
    await a.put("/profile").send(PROFILE).expect(200);
    await b.put("/profile").send({ ...PROFILE, stack: ["COBOL"] }).expect(200);

    fake.willReturn(SCORE);
    const scored = await a.post(`/postings/${shared.id}/score`).expect(201);
    expect(scored.body).toMatchObject({ postingId: shared.id, verdict: "fit" });

    expect((await a.get("/postings")).body.items[0].latestScore).toMatchObject({ verdict: "fit" });
    expect((await b.get("/postings")).body.items[0].latestScore).toBeNull();
    await b.get(`/postings/${shared.id}/score`).expect(404);
    expect((await prisma.postingScore.findFirstOrThrow({ where: { postingId: shared.id } })).userId).not.toBeNull();
  });

  it("scoring without a profile is refused with the profile_required error", async () => {
    await verifyAdminEmail();
    const shared = (await admin.post("/postings").send({ ...job("https://acme.com/shared-3"), scope: "catalog" }).expect(201)).body as { id: string };
    const res = await b.post(`/postings/${shared.id}/score`).expect(422);
    expect(res.body).toMatchObject({ error: "profile_not_configured" });
    expect(fake.requests).toHaveLength(0);
  });
});
