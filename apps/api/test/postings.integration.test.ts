import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";

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
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
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
