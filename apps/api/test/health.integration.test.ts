import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { DATABASE_HEALTH } from "../src/health/domain/database-health.port.js";
import { setupSwagger } from "../src/setup-app.js";

async function createApp(databaseUp?: boolean): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (databaseUp !== undefined) {
    builder = builder.overrideProvider(DATABASE_HEALTH).useValue({ isUp: async () => databaseUp });
  }
  const app = (await builder.compile()).createNestApplication();
  setupSwagger(app);
  await app.init();
  return app;
}

describe("GET /health (real database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with db up", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });

  it("serves Swagger UI at /docs", async () => {
    const res = await request(app.getHttpServer()).get("/docs");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger");
  });
});

describe("GET /health (database down)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp(false);
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns 503 with db down", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", db: "down" });
  });
});
