import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { DATABASE_HEALTH } from "../src/health/domain/database-health.port.js";
import { setupSwagger } from "../src/setup-app.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { removeTestUsers, TEST_PASSWORD } from "./helpers/auth.js";

const WEB_ORIGIN = "http://localhost:5173";
const email = () => `auth-${randomUUID()}@test.jobradar.local`;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

async function createApp(): Promise<INestApplication> {
  const app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  setupSwagger(app);
  await app.init();
  return app;
}

/** The raw `set-cookie` lines of a response. */
function setCookies(res: request.Response): string[] {
  const header = res.headers["set-cookie"] as string[] | string | undefined;
  return Array.isArray(header) ? header : header ? [header] : [];
}

function sessionCookie(res: request.Response): string {
  const line = setCookies(res).find((cookie) => cookie.startsWith("jr_session="));
  if (!line) throw new Error("No session cookie in the response");
  return line;
}

const tokenOf = (cookieLine: string) => decodeURIComponent(cookieLine.split(";")[0]?.split("=")[1] ?? "");

let app: INestApplication;
let prisma: PrismaService;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});

describe("POST /auth/register", () => {
  it("creates the account, logs it in with a hardened cookie and exposes nothing secret", async () => {
    const address = email();
    const res = await http().post("/auth/register").send({ email: address, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), email: address, hasPassword: true, googleLinked: false, emailVerified: false });
    expect(Object.keys(res.body).sort()).toEqual(["emailVerified", "email", "googleLinked", "hasPassword", "id"].sort()); // no hash, no provider id

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Expires=/);
    expect(cookie).not.toMatch(/Secure/i); // tests run with NODE_ENV=test; production adds Secure
  });

  it("stores a salted slow hash of the password and only the hash of the session token", async () => {
    const address = email();
    const res = await http().post("/auth/register").send({ email: address, password: TEST_PASSWORD });
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(TEST_PASSWORD);

    const token = tokenOf(sessionCookie(res));
    const sessions = await prisma.session.findMany({ where: { userId: stored.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).not.toBe(token);
    expect(sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalizes the email and refuses a duplicate in any case", async () => {
    const address = email();
    await http().post("/auth/register").send({ email: `  ${address.toUpperCase()} `, password: TEST_PASSWORD }).expect(201);
    const again = await http().post("/auth/register").send({ email: address, password: TEST_PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ statusCode: 409, error: "email_taken" });
  });

  it("answers 400 for a malformed body, a short password or a password equal to the email", async () => {
    await http().post("/auth/register").send({ email: "not-an-email", password: TEST_PASSWORD }).expect(400);
    await http().post("/auth/register").send({ email: email(), password: "short" }).expect(400);
    await http().post("/auth/register").send({ email: email() }).expect(400);
    const same = `same-${randomUUID()}@test.jobradar.local`;
    const res = await http().post("/auth/register").send({ email: same, password: same });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("weak_password");
  });
});

describe("POST /auth/login, GET /auth/me and POST /auth/logout", () => {
  const address = email();
  beforeAll(async () => {
    await http().post("/auth/register").send({ email: address, password: TEST_PASSWORD }).expect(201);
  });

  it("logs in and lets the cookie reach /auth/me", async () => {
    const login = await http().post("/auth/login").send({ email: address.toUpperCase(), password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ email: address });
    const me = await http().get("/auth/me").set("Cookie", sessionCookie(login).split(";")[0] ?? "");
    expect(me.status).toBe(200);
    expect(me.body).toEqual(login.body);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await http().post("/auth/login").send({ email: address, password: "not the password" });
    const unknown = await http().post("/auth/login").send({ email: email(), password: TEST_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error).toBe("invalid_credentials");
    expect(setCookies(wrong)).toEqual([]);
  });

  it("logout deletes the session on the server: replaying the old cookie no longer works", async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post("/auth/login").send({ email: address, password: TEST_PASSWORD }).expect(200);
    const oldCookie = sessionCookie(login).split(";")[0] ?? "";
    await agent.get("/auth/me").expect(200);

    const out = await agent.post("/auth/logout");
    expect(out.status).toBe(204);
    expect(sessionCookie(out)).toMatch(/jr_session=;/); // cleared
    await agent.get("/auth/me").expect(401);
    await http().get("/auth/me").set("Cookie", oldCookie).expect(401);
  });

  it("logging out without a session is harmless", async () => {
    await http().post("/auth/logout").expect(204);
  });

  it("blocks an email after repeated failures (429 with Retry-After), even for the right password", async () => {
    const victim = email();
    await http().post("/auth/register").send({ email: victim, password: TEST_PASSWORD }).expect(201);
    for (let i = 0; i < 5; i += 1) {
      await http().post("/auth/login").send({ email: victim, password: "wrong" }).expect(401);
    }
    const blocked = await http().post("/auth/login").send({ email: victim, password: TEST_PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("too_many_attempts");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("authentication is required everywhere except the public endpoints", () => {
  const protectedRoutes: [string, string][] = [
    ["get", "/auth/me"],
    ["get", "/postings"],
    ["post", "/postings"],
    ["get", "/profile"],
    ["put", "/profile"],
    ["post", "/profile/import-cv"],
    ["post", `/postings/${UNKNOWN_ID}/score`],
    ["get", `/postings/${UNKNOWN_ID}/score`],
    ["get", "/ai/usage"],
    ["get", "/auth/tokens"],
    ["post", "/auth/tokens"],
    ["delete", `/auth/tokens/${UNKNOWN_ID}`],
  ];

  it.each(protectedRoutes)("%s %s answers 401 without a session", async (method, path) => {
    const res = await (http() as unknown as Record<string, (path: string) => request.Test>)[method]?.(path);
    expect(res?.status).toBe(401);
    expect(res?.body).toMatchObject({ statusCode: 401, error: "unauthenticated" });
  });

  it("rejects a made-up, an empty and a malformed session cookie", async () => {
    for (const cookie of ["jr_session=made-up-token", "jr_session=", "jr_session=%E0%A4%A", "other=1"]) {
      await http().get("/auth/me").set("Cookie", cookie).expect(401);
    }
  });

  it("rejects an expired session", async () => {
    const res = await http().post("/auth/register").send({ email: email(), password: TEST_PASSWORD }).expect(201);
    const cookie = sessionCookie(res).split(";")[0] ?? "";
    await http().get("/auth/me").set("Cookie", cookie).expect(200);
    await prisma.session.updateMany({ where: { userId: res.body.id as string }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().get("/auth/me").set("Cookie", cookie).expect(401);
  });

  it("keeps health and the API docs public", async () => {
    await http().get("/health").expect(200);
    await http().get("/docs").expect(200);
  });
});

describe("Origin check (CSRF)", () => {
  async function loggedInCookie(): Promise<string> {
    const res = await http().post("/auth/register").send({ email: email(), password: TEST_PASSWORD }).expect(201);
    return sessionCookie(res).split(";")[0] ?? "";
  }

  it("refuses a write that comes from an unknown origin, even with a valid cookie", async () => {
    const cookie = await loggedInCookie();
    const res = await http().put("/profile").set("Cookie", cookie).set("Origin", "https://evil.example").send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("bad_origin");
    const nullOrigin = await http().post("/postings").set("Cookie", cookie).set("Origin", "null").send({});
    expect(nullOrigin.status).toBe(403);
  });

  it("also protects login and registration against cross-site forms", async () => {
    const res = await http().post("/auth/login").set("Origin", "https://evil.example").send({ email: email(), password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("bad_origin");
  });

  it("lets the web app's own origin and requests without Origin through", async () => {
    const cookie = await loggedInCookie();
    const fromWeb = await http().post("/postings").set("Cookie", cookie).set("Origin", WEB_ORIGIN).send({});
    expect(fromWeb.status).toBe(400); // got past the guards, rejected only for the empty body
    const noOrigin = await http().post("/postings").set("Cookie", cookie).send({});
    expect(noOrigin.status).toBe(400);
  });

  it("does not restrict reads", async () => {
    const cookie = await loggedInCookie();
    await http().get("/auth/me").set("Cookie", cookie).set("Origin", "https://evil.example").expect(200);
  });
});

describe("registration can be closed", () => {
  let closed: INestApplication | undefined;
  const previous = process.env["ALLOW_SIGNUP"];
  afterEach(async () => {
    if (previous === undefined) delete process.env["ALLOW_SIGNUP"];
    else process.env["ALLOW_SIGNUP"] = previous;
    await closed?.close();
  });

  it("answers 403 signup_disabled when ALLOW_SIGNUP=false, but existing accounts can still log in", async () => {
    const address = email();
    await http().post("/auth/register").send({ email: address, password: TEST_PASSWORD }).expect(201);

    process.env["ALLOW_SIGNUP"] = "false";
    closed = await createApp();
    const res = await request(closed.getHttpServer()).post("/auth/register").send({ email: email(), password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("signup_disabled");
    await request(closed.getHttpServer()).post("/auth/login").send({ email: address, password: TEST_PASSWORD }).expect(200);
  });
});

describe("health stays up for the database probe", () => {
  it("is reachable without credentials even when the database is down", async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_HEALTH)
      .useValue({ isUp: async () => false })
      .compile();
    const down = module.createNestApplication();
    await down.init();
    const res = await request(down.getHttpServer()).get("/health");
    expect(res.status).toBe(503);
    await down.close();
  });
});
