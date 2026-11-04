import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { DATABASE_HEALTH } from "../src/health/domain/database-health.port.js";
import { setupCors } from "../src/setup-app.js";

describe("CORS", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_HEALTH)
      .useValue({ isUp: async () => true })
      .compile();
    app = moduleRef.createNestApplication();
    setupCors(app, ["http://localhost:5173"]);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it("allows the configured web origin, including the preflight of a JSON PUT", async () => {
    const res = await request(app.getHttpServer())
      .options("/profile")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PUT")
      .set("Access-Control-Request-Headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-methods"]).toContain("PUT");
  });

  it("sends the allow-origin header on normal responses from the web origin", async () => {
    const res = await request(app.getHttpServer()).get("/health").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not allow any other origin", async () => {
    const res = await request(app.getHttpServer()).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
