import "reflect-metadata";
import { Controller, Get, Req, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { setupTrustProxy } from "../src/setup-app.js";

@Controller("whoami")
class WhoAmIController {
  @Get()
  whoami(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

let app: INestApplication;
afterEach(async () => {
  await app.close();
});

async function appWith(hops: number | null): Promise<INestApplication> {
  app = (await Test.createTestingModule({ controllers: [WhoAmIController] }).compile()).createNestApplication();
  if (hops !== null) setupTrustProxy(app, hops);
  await app.init();
  return app;
}

describe("trust proxy", () => {
  it("ignores X-Forwarded-For when no proxy is trusted: a client cannot pick its IP", async () => {
    await appWith(0);
    const res = await request(app.getHttpServer()).get("/whoami").set("X-Forwarded-For", "6.6.6.6");
    expect(res.body.ip).not.toBe("6.6.6.6");
  });

  it("with one trusted hop the client is the address that hop appended, not what the client claimed", async () => {
    await appWith(1);
    // Caddy appends the address it saw as the LAST entry; anything before it is client-controlled.
    const res = await request(app.getHttpServer()).get("/whoami").set("X-Forwarded-For", "6.6.6.6, 203.0.113.9");
    expect(res.body.ip).toBe("203.0.113.9");
  });
});
