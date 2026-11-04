import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { currentUserId, loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";
import { makePdf } from "./helpers/make-pdf.js";

/**
 * The core guarantee of accounts (ADR-0002): one account never sees, changes or spends another's data.
 * Every test uses two real accounts, A and B, through the real HTTP stack and database.
 */

const profileOf = (stack: string) => ({
  stack: [stack],
  seniority: "senior",
  allowedLocations: ["BO"],
  maxEnglishLevel: "B2",
  excludedContractTypes: [],
  summary: `Summary of ${stack}`,
});
const posting = (url: string, title = "Backend dev") => ({
  title,
  company: "Acme",
  url,
  source: "manual",
  remoteScope: "latam",
  description: "Node.js",
});
const SCORE = { verdict: "maybe", reasons: ["Needs checking"], blockers: [] };
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let a: Agent;
let b: Agent;
let idA: string;
let idB: string;

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  a = await loginAgent(app);
  b = await loginAgent(app);
  idA = await currentUserId(a);
  idB = await currentUserId(b);
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

describe("postings", () => {
  it("each account lists only its own postings, with its own totals", async () => {
    await a.post("/postings").send(posting("https://acme.com/a1", "A one")).expect(201);
    await a.post("/postings").send(posting("https://acme.com/a2", "A two")).expect(201);
    await b.post("/postings").send(posting("https://acme.com/b1", "B one")).expect(201);

    const listA = (await a.get("/postings")).body as { items: { title: string }[]; total: number };
    const listB = (await b.get("/postings")).body as { items: { title: string }[]; total: number };
    expect(listA.items.map((p) => p.title).sort()).toEqual(["A one", "A two"]);
    expect(listA.total).toBe(2);
    expect(listB.items.map((p) => p.title)).toEqual(["B one"]);
    expect(listB.total).toBe(1);
  });

  it("search, source and verdict filters cannot reach another account's postings", async () => {
    await a.post("/postings").send({ ...posting("https://acme.com/secret"), description: "top-secret-keyword" }).expect(201);
    expect((await b.get("/postings?q=top-secret-keyword")).body.total).toBe(0);
    expect((await b.get("/postings?source=manual")).body.total).toBe(0);
    expect((await b.get("/postings?verdict=unscored")).body.total).toBe(0);
    expect((await a.get("/postings?q=top-secret-keyword")).body.total).toBe(1);
  });

  it("two accounts can track the same url; inside one account it is still a duplicate", async () => {
    const same = posting("https://acme.com/shared-job");
    const first = await a.post("/postings").send(same).expect(201);
    const second = await b.post("/postings").send(same).expect(201);
    expect(first.body.id).not.toBe(second.body.id);
    await a.post("/postings").send(same).expect(409);
    await b.post("/postings").send(same).expect(409);
  });

  it("never exposes the owner in the response", async () => {
    const created = await a.post("/postings").send(posting("https://acme.com/x")).expect(201);
    expect(created.body).not.toHaveProperty("userId");
    const listed = (await a.get("/postings")).body.items[0] as object;
    expect(listed).not.toHaveProperty("userId");
    expect(JSON.stringify(created.body)).not.toContain(idA);
  });
});

describe("scores", () => {
  it("another account's posting answers 404 on both score endpoints, and never reaches the AI", async () => {
    await a.put("/profile").send(profileOf("TypeScript")).expect(200);
    await b.put("/profile").send(profileOf("Go")).expect(200);
    const postingA = (await a.post("/postings").send(posting("https://acme.com/a1")).expect(201)).body.id as string;
    fake.willReturn(SCORE);
    await a.post(`/postings/${postingA}/score`).expect(201);
    fake.requests.length = 0;

    expect((await b.post(`/postings/${postingA}/score`)).status).toBe(404);
    expect((await b.get(`/postings/${postingA}/score`)).status).toBe(404);
    expect(fake.requests).toHaveLength(0);
    expect(await prisma.aiCall.count({ where: { userId: idB } })).toBe(0);
    // the owner still reads it
    expect((await a.get(`/postings/${postingA}/score`)).status).toBe(200);
  });

  it("a score is invisible to the other account's list and verdict filter", async () => {
    await a.put("/profile").send(profileOf("TypeScript")).expect(200);
    const postingA = (await a.post("/postings").send(posting("https://acme.com/a1")).expect(201)).body.id as string;
    fake.willReturn({ verdict: "fit", reasons: ["Great match"], blockers: [] });
    await a.post(`/postings/${postingA}/score`).expect(201);
    await b.post("/postings").send(posting("https://acme.com/a1")).expect(201); // same url, B's own copy

    expect((await a.get("/postings?verdict=fit")).body.total).toBe(1);
    expect((await b.get("/postings?verdict=fit")).body.total).toBe(0);
    const listB = (await b.get("/postings")).body.items as { latestScore: unknown }[];
    expect(listB[0]?.latestScore).toBeNull();
  });

  it("the score is built with the owner's profile and recorded under the owner", async () => {
    // distinctive stacks: the generic instructions already mention common technologies
    await a.put("/profile").send(profileOf("Fortran77")).expect(200);
    await b.put("/profile").send(profileOf("Cobol85")).expect(200);
    const postingA = (await a.post("/postings").send(posting("https://acme.com/a1")).expect(201)).body.id as string;
    const postingB = (await b.post("/postings").send(posting("https://acme.com/b1")).expect(201)).body.id as string;
    fake.willReturn(SCORE).willReturn(SCORE);
    await a.post(`/postings/${postingA}/score`).expect(201);
    await b.post(`/postings/${postingB}/score`).expect(201);

    expect(fake.requests[0]?.system).toContain("Fortran77");
    expect(fake.requests[0]?.system).not.toContain("Cobol85");
    expect(fake.requests[1]?.system).toContain("Cobol85");
    expect(fake.requests[1]?.system).not.toContain("Fortran77");
    expect(await prisma.postingScore.count({ where: { userId: idA, postingId: postingA } })).toBe(1);
    expect(await prisma.postingScore.count({ where: { userId: idB, postingId: postingB } })).toBe(1);
    expect(await prisma.postingScore.count({ where: { userId: idA, postingId: postingB } })).toBe(0);
  });

  it("scoring without a profile of your own fails even if another account has one", async () => {
    await a.put("/profile").send(profileOf("TypeScript")).expect(200);
    const postingB = (await b.post("/postings").send(posting("https://acme.com/b1")).expect(201)).body.id as string;
    const res = await b.post(`/postings/${postingB}/score`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("profile_not_configured");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("profile", () => {
  it("each account has its own profile and version history", async () => {
    await a.put("/profile").send(profileOf("TypeScript")).expect(200);
    await a.put("/profile").send({ ...profileOf("TypeScript"), seniority: "lead" }).expect(200);
    expect((await b.get("/profile")).status).toBe(404);

    const savedB = await b.put("/profile").send(profileOf("Go")).expect(200);
    expect(savedB.body).toMatchObject({ version: 1, stack: ["Go"] });
    expect((await a.get("/profile")).body).toMatchObject({ version: 2, stack: ["TypeScript"], seniority: "lead" });
    expect(savedB.body).not.toHaveProperty("userId");
    expect(await prisma.candidateProfile.count()).toBe(2);
  });

  it("a CV import is metered and logged under the account that uploaded it", async () => {
    fake.willReturn({
      stack: ["TypeScript"],
      yearsOfExperience: 5,
      countryOfResidence: "BO",
      englishLevel: "B1",
      summary: "Dev",
      education: [],
      experience: [],
      languages: [],
      certifications: [],
    });
    const pdf = makePdf([["Backend developer", "TypeScript"]]);
    await b.post("/profile/import-cv").attach("file", pdf, { filename: "cv.pdf", contentType: "application/pdf" }).expect(200);

    expect(await prisma.aiCall.count({ where: { userId: idB, purpose: "cv_extraction" } })).toBe(1);
    expect(await prisma.aiCall.count({ where: { userId: idA } })).toBe(0);
    expect((await a.get("/ai/usage")).body).toMatchObject({ calls: 0 });
    expect((await b.get("/ai/usage")).body).toMatchObject({ calls: 1 });
  });
});

describe("ownership in the database", () => {
  it("every row an account creates carries its id", async () => {
    await a.put("/profile").send(profileOf("TypeScript")).expect(200);
    const postingA = (await a.post("/postings").send(posting("https://acme.com/a1")).expect(201)).body.id as string;
    fake.willReturn(SCORE);
    await a.post(`/postings/${postingA}/score`).expect(201);

    expect(await prisma.posting.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.candidateProfile.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.postingScore.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.aiCall.count({ where: { userId: null } })).toBe(0);
    expect(await prisma.posting.count({ where: { userId: idA } })).toBe(1);
  });

  it("deleting an account deletes its data and nothing else", async () => {
    const doomed = await loginAgent(app);
    const doomedId = await currentUserId(doomed);
    await doomed.put("/profile").send(profileOf("Rust")).expect(200);
    await doomed.post("/postings").send(posting("https://acme.com/doomed")).expect(201);
    await a.post("/postings").send(posting("https://acme.com/keep")).expect(201);

    await prisma.user.delete({ where: { id: doomedId } });

    expect(await prisma.posting.count({ where: { userId: doomedId } })).toBe(0);
    expect(await prisma.candidateProfile.count({ where: { userId: doomedId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: doomedId } })).toBe(0);
    expect((await a.get("/postings")).body.total).toBe(1);
  });

  it("an unknown id is a 404 for everyone, like another account's id", async () => {
    expect((await a.get(`/postings/${UNKNOWN}/score`)).status).toBe(404);
    expect((await b.post(`/postings/${UNKNOWN}/score`)).status).toBe(404);
  });
});
