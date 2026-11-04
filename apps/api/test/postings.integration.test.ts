import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

const body = {
  title: "Backend Developer",
  company: "Acme",
  url: "https://acme.com/jobs/1",
  source: "getonboard",
  remoteScope: "latam",
  description: "NestJS and PostgreSQL",
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
  await prisma.posting.deleteMany();
});

describe("POST /postings", () => {
  it("creates a posting and returns 201", async () => {
    const res = await http().post("/postings").send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...body, location: null, publishedAt: null });
    expect(res.body.id).toBeTypeOf("string");
    expect(res.body.createdAt).toBeTypeOf("string");
  });

  it("stores optional fields and applies defaults", async () => {
    const res = await http()
      .post("/postings")
      .send({ title: "Dev", company: "Acme", url: "https://acme.com/jobs/2", source: "manual", location: "Bolivia", publishedAt: "2026-05-01T10:00:00Z" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ location: "Bolivia", remoteScope: "unknown", description: "", publishedAt: "2026-05-01T10:00:00.000Z" });
  });

  it("returns 400 for an invalid body", async () => {
    const res = await http().post("/postings").send({ ...body, url: "ftp://nope", title: "" });
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeInstanceOf(Array);
  });

  it("returns 409 when the url already exists", async () => {
    await http().post("/postings").send(body).expect(201);
    await http().post("/postings").send(body).expect(409);
  });

  it("stores a posting pasted without a URL under a manual identity and dedupes it", async () => {
    const manual = { ...body, url: `manual:${"3c".repeat(32)}`, source: "manual" };
    const created = await http().post("/postings").send(manual).expect(201);
    expect(created.body.url).toBe(manual.url);
    await http().post("/postings").send(manual).expect(409);
    await http().post("/postings").send({ ...manual, url: manual.url.toUpperCase() }).expect(400);
  });

  it("returns 409 for a url that only differs by tracking params", async () => {
    await http().post("/postings").send(body).expect(201);
    await http()
      .post("/postings")
      .send({ ...body, url: "https://ACME.com/jobs/1/?utm_source=rss&fbclid=abc#top" })
      .expect(409);
  });

  it("returns 409 for concurrent duplicates instead of failing", async () => {
    const results = await Promise.all([http().post("/postings").send(body), http().post("/postings").send(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe("GET /postings", () => {
  async function seed(n: number, source = "manual", prefix = "p"): Promise<void> {
    for (let i = 1; i <= n; i++) {
      await http()
        .post("/postings")
        .send({ ...body, title: `Job ${prefix}${i}`, url: `https://acme.com/${prefix}/${i}`, source })
        .expect(201);
    }
  }

  it("returns an empty page when there are no postings", async () => {
    const res = await http().get("/postings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it("paginates newest first", async () => {
    await seed(5);
    const res = await http().get("/postings?page=2&pageSize=2");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(res.body.items.map((p: { title: string }) => p.title)).toEqual(["Job p3", "Job p2"]);
  });

  it("filters by source and q", async () => {
    await seed(2, "getonboard", "g");
    await seed(3, "manual", "m");
    expect((await http().get("/postings?source=getonboard")).body.total).toBe(2);
    expect((await http().get("/postings?q=JOB%20M")).body.total).toBe(3);
    expect((await http().get("/postings?source=manual&q=nestjs")).body.total).toBe(3);
    expect((await http().get("/postings?q=cobol")).body.total).toBe(0);
  });

  it("returns 400 when pageSize exceeds 100", async () => {
    await http().get("/postings?pageSize=101").expect(400);
  });
});

describe("GET /postings with verdicts", () => {
  async function createPosting(n: number, createdAt: Date): Promise<string> {
    const res = await http().post("/postings").send({ ...body, url: `https://acme.com/jobs/v${n}`, title: `Job ${n}` });
    await prisma.posting.update({ where: { id: res.body.id as string }, data: { createdAt } });
    return res.body.id as string;
  }
  const addScore = (postingId: string, verdict: "fit" | "maybe" | "reject", createdAt: Date, blockers: object[] = []) =>
    prisma.postingScore.create({
      data: { postingId, verdict, reasons: [`why ${verdict}`], blockers, profileVersion: 1, promptVersion: "t", model: "m", createdAt },
    });
  const t = (hour: number) => new Date(Date.UTC(2026, 10, 3, hour));
  const titles = async (query: string) => ((await http().get(`/postings?${query}`)).body.items as { title: string }[]).map((p) => p.title);

  beforeEach(async () => {
    const a = await createPosting(1, t(1));
    const b = await createPosting(2, t(2));
    const c = await createPosting(3, t(3));
    await createPosting(4, t(4)); // never scored
    await addScore(a, "fit", t(5));
    await addScore(b, "reject", t(5), [{ type: "location", evidence: "US only" }]);
    await addScore(c, "fit", t(5));
    await addScore(c, "reject", t(6)); // newer score supersedes the fit
  });

  it("includes latestScore (newest score) or null in every item", async () => {
    const res = await http().get("/postings?pageSize=10");
    const byTitle = Object.fromEntries((res.body.items as { title: string; latestScore: unknown }[]).map((p) => [p.title, p.latestScore]));
    expect(byTitle["Job 2"]).toEqual({
      verdict: "reject", reasons: ["why reject"], blockers: [{ type: "location", evidence: "US only" }],
      scoredAt: t(5).toISOString(),
    });
    expect(byTitle["Job 3"]).toMatchObject({ verdict: "reject", scoredAt: t(6).toISOString() });
    expect(byTitle["Job 4"]).toBeNull();
  });

  it("filters on the latest verdict", async () => {
    expect(await titles("verdict=fit")).toEqual(["Job 1"]);
    expect(await titles("verdict=reject")).toEqual(["Job 3", "Job 2"]);
    expect(await titles("verdict=maybe")).toEqual([]);
  });

  it("filters unscored postings", async () => {
    expect(await titles("verdict=unscored")).toEqual(["Job 4"]);
  });

  it("filters by createdSince and combines it with verdict, paging and total", async () => {
    const since = encodeURIComponent(t(2).toISOString());
    expect(await titles(`createdSince=${since}`)).toEqual(["Job 4", "Job 3", "Job 2"]);
    expect(await titles(`createdSince=${since}&verdict=reject`)).toEqual(["Job 3", "Job 2"]);
    const page = await http().get(`/postings?createdSince=${since}&verdict=reject&page=2&pageSize=1`);
    expect(page.body).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(page.body.items).toHaveLength(1);
  });

  it("returns 400 for an unknown verdict or a non-ISO createdSince", async () => {
    expect((await http().get("/postings?verdict=great")).status).toBe(400);
    expect((await http().get("/postings?createdSince=yesterday")).status).toBe(400);
  });
});
