import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

const body = {
  stack: ["TypeScript", "NestJS", "PostgreSQL"],
  seniority: "senior",
  allowedLocations: ["BO", "latam"],
  maxEnglishLevel: "B2",
  excludedContractTypes: ["temporary", "internship"],
  summary: "Full stack developer",
};

let app: INestApplication;
let prisma: PrismaService;
let agent: Agent;
const http = () => agent;

beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  await app.init();
  agent = await loginAgent(app);
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});
beforeEach(async () => {
  await prisma.candidateProfile.deleteMany();
});

describe("GET /profile", () => {
  it("returns 404 before the profile is configured", async () => {
    await http().get("/profile").expect(404);
  });

  it("returns the saved profile", async () => {
    await http().put("/profile").send(body).expect(200);
    const res = await http().get("/profile");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...body, version: 1 });
    expect(res.body.updatedAt).toBeTypeOf("string");
  });
});

describe("PUT /profile", () => {
  it("creates the profile with version 1 and applies defaults", async () => {
    const { excludedContractTypes: _e, summary: _s, ...minimal } = body;
    const res = await http().put("/profile").send(minimal);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...minimal, excludedContractTypes: [], summary: "", version: 1 });
  });

  it("replaces the profile and increments the version", async () => {
    await http().put("/profile").send(body).expect(200);
    const res = await http().put("/profile").send({ ...body, seniority: "lead", stack: ["Go"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 2, seniority: "lead", stack: ["Go"] });
    expect((await prisma.candidateProfile.count())).toBe(1);
  });

  it("keeps a single row and counts every save as a version, even concurrent ones", async () => {
    await Promise.all([1, 2, 3].map(() => http().put("/profile").send(body).expect(200)));
    const res = await http().get("/profile");
    expect(res.body.version).toBe(3);
    expect(await prisma.candidateProfile.count()).toBe(1);
  });

  it("de-duplicates stack entries", async () => {
    const res = await http().put("/profile").send({ ...body, stack: ["TypeScript", " typescript ", "Go"] });
    expect(res.body.stack).toEqual(["TypeScript", "Go"]);
  });

  it.each([
    ["empty stack", { stack: [] }],
    ["no locations", { allowedLocations: [] }],
    ["lowercase country code", { allowedLocations: ["bo"] }],
    ["unknown seniority", { seniority: "wizard" }],
    ["unknown english level", { maxEnglishLevel: "D1" }],
    ["unknown contract type", { excludedContractTypes: ["forever"] }],
  ])("returns 400 for %s", async (_name, patch) => {
    const res = await http().put("/profile").send({ ...body, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeInstanceOf(Array);
    expect(await prisma.candidateProfile.count()).toBe(0);
  });
});
