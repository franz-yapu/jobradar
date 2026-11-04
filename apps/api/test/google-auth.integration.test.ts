import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { IDENTITY_PROVIDER } from "../src/auth/domain/identity-provider.js";
import { FakeIdentityProvider } from "../src/auth/infrastructure/fake-identity.provider.js";
import { GOOGLE_WEB } from "../src/auth/infrastructure/oauth.controller.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { loginAgent, removeTestUsers, TEST_PASSWORD, type Agent } from "./helpers/auth.js";

const WEB = "http://localhost:5173";
const email = () => `google-${randomUUID()}@test.jobradar.local`;
const fake = new FakeIdentityProvider();

let configured: INestApplication;
let unconfigured: INestApplication;
let prisma: PrismaService;
const http = () => request(configured.getHttpServer());

beforeAll(async () => {
  // A developer's real .env may have Google set up; this app must start without it.
  const saved = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].map((key) => [key, process.env[key]] as const);
  for (const [key] of saved) Reflect.deleteProperty(process.env, key);
  unconfigured = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  await unconfigured.init();
  for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
  configured = (
    await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(fake)
      .overrideProvider(GOOGLE_WEB)
      .useValue({ webOrigin: WEB, cookiePath: "/auth/google" })
      .compile()
  ).createNestApplication();
  await configured.init();
  prisma = configured.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(configured);
  await configured.close();
  await unconfigured.close();
});

const cookies = (res: request.Response): string[] => {
  const header = res.headers["set-cookie"] as string[] | string | undefined;
  return Array.isArray(header) ? header : header ? [header] : [];
};
const cookieLine = (res: request.Response, name: string) => cookies(res).find((line) => line.startsWith(`${name}=`));
const stateOf = (res: request.Response) => new URL(String(res.headers["location"])).searchParams.get("state") ?? "";

/** Runs a whole Google round trip with `identity` as what Google says, in the browser `agent`. */
async function roundTrip(agent: request.Agent | Agent, identity: { sub: string; email: string }, path = "/auth/google/start") {
  const start = await agent.get(path);
  expect(start.status).toBe(302);
  const state = stateOf(start);
  fake.willVerify(identity);
  const callback = await agent.get("/auth/google/callback").query({ code: "code", state });
  return { start, callback, state };
}

describe("when Google is not configured", () => {
  it("offers no Google and answers 404 on its endpoints", async () => {
    const providers = await request(unconfigured.getHttpServer()).get("/auth/providers").expect(200);
    expect(providers.body).toEqual({ google: false });
    await request(unconfigured.getHttpServer()).get("/auth/google/start").expect(404);
    await request(unconfigured.getHttpServer()).get("/auth/google/callback").query({ code: "c", state: "s" }).expect(404);
  });
});

describe("GET /auth/providers and /auth/google/start", () => {
  it("says Google is available and redirects to it with the attempt cookie", async () => {
    expect((await http().get("/auth/providers").expect(200)).body).toEqual({ google: true });

    const res = await http().get("/auth/google/start").query({ returnTo: "/profile" });
    expect(res.status).toBe(302);
    expect(String(res.headers["location"])).toMatch(/^https:\/\/accounts\.example\.test\/auth\?/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const line = cookieLine(res, "jr_oauth") ?? "";
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\/auth\/google/);
    expect(decodeURIComponent(line.split(";")[0]?.split("=")[1] ?? "")).toBe(stateOf(res));
    // only the hash of the state is stored
    const rows = await prisma.oAuthFlow.findMany();
    expect(rows.some((row) => row.returnTo === "/profile")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(stateOf(res));
  });
});

describe("GET /auth/google/callback: sign in and sign up", () => {
  it("creates a verified account without a password, opens a session and goes back to the web app", async () => {
    const agent = request.agent(configured.getHttpServer());
    const address = email();
    const sub = randomUUID();
    const start = await agent.get("/auth/google/start").query({ returnTo: "/profile" });
    fake.willVerify({ sub, email: address });
    const callback = await agent.get("/auth/google/callback").query({ code: "code", state: stateOf(start) });

    expect(callback.status).toBe(302);
    expect(callback.headers["location"]).toBe(`${WEB}/profile`);
    const session = cookieLine(callback, "jr_session") ?? "";
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(cookieLine(callback, "jr_oauth")).toMatch(/Expires=Thu, 01 Jan 1970/); // attempt cookie cleared

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(stored).toMatchObject({ googleSub: sub, passwordHash: null });
    expect(stored.emailVerifiedAt).not.toBeNull();
    const me = await agent.get("/auth/me").expect(200);
    expect(me.body).toMatchObject({ email: address, hasPassword: false, googleLinked: true, emailVerified: true });

    // a Google-only account cannot log in with a password: same answer as an unknown email
    const byPassword = await http().post("/auth/login").send({ email: address, password: TEST_PASSWORD });
    const unknown = await http().post("/auth/login").send({ email: email(), password: TEST_PASSWORD });
    expect(byPassword.status).toBe(401);
    expect(byPassword.body).toEqual(unknown.body);
  });

  it("logs the same Google identity in again", async () => {
    const identity = { sub: randomUUID(), email: email() };
    await roundTrip(request.agent(configured.getHttpServer()), identity);
    const again = await roundTrip(request.agent(configured.getHttpServer()), identity);
    expect(again.callback.headers["location"]).toBe(`${WEB}/`);
    expect(await prisma.user.count({ where: { email: identity.email } })).toBe(1);
  });

  it("never logs into or links a password account with the same email", async () => {
    const address = email();
    await request(configured.getHttpServer()).post("/auth/register").send({ email: address, password: TEST_PASSWORD }).expect(201);
    const { callback } = await roundTrip(request.agent(configured.getHttpServer()), { sub: randomUUID(), email: address });
    expect(callback.headers["location"]).toBe(`${WEB}/login?error=google_link_required`);
    expect(cookieLine(callback, "jr_session")).toBeUndefined();
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(stored.googleSub).toBeNull();
    expect(stored.emailVerifiedAt).toBeNull();
  });

  it("refuses a callback without the attempt cookie (another browser) or with a state it does not know", async () => {
    const start = await http().get("/auth/google/start");
    fake.willVerify({ sub: randomUUID(), email: email() });
    const otherBrowser = await http().get("/auth/google/callback").query({ code: "code", state: stateOf(start) });
    expect(otherBrowser.headers["location"]).toBe(`${WEB}/login?error=google_failed`);
    expect(cookieLine(otherBrowser, "jr_session")).toBeUndefined();

    const forged = await http().get("/auth/google/callback").set("Cookie", "jr_oauth=forged").query({ code: "code", state: "forged" });
    expect(forged.headers["location"]).toBe(`${WEB}/login?error=google_failed`);
  });

  it("cannot be replayed", async () => {
    const agent = request.agent(configured.getHttpServer());
    const { callback, state } = await roundTrip(agent, { sub: randomUUID(), email: email() });
    expect(cookieLine(callback, "jr_session")).toBeDefined();
    const replay = await request(configured.getHttpServer()).get("/auth/google/callback").set("Cookie", `jr_oauth=${state}`).query({ code: "code", state });
    expect(replay.headers["location"]).toBe(`${WEB}/login?error=google_failed`);
    expect(cookieLine(replay, "jr_session")).toBeUndefined();
  });

  it("turns a provider refusal, a cancelled consent and a malformed callback into a generic error", async () => {
    const agent = request.agent(configured.getHttpServer());
    const start = await agent.get("/auth/google/start");
    fake.willFail("nonce mismatch");
    const rejected = await agent.get("/auth/google/callback").query({ code: "code", state: stateOf(start) });
    expect(rejected.headers["location"]).toBe(`${WEB}/login?error=google_failed`);
    expect(String(rejected.headers["location"])).not.toContain("nonce");

    const second = await agent.get("/auth/google/start");
    const cancelled = await agent.get("/auth/google/callback").query({ error: "access_denied", state: stateOf(second) });
    expect(cancelled.headers["location"]).toBe(`${WEB}/login?error=google_failed`);

    const malformed = await agent.get("/auth/google/callback?code=a&code=b&state=x");
    expect(malformed.headers["location"]).toBe(`${WEB}/login?error=google_failed`);
  });

  it("only returns to a path inside the web app", async () => {
    for (const evil of ["https://evil.example/x", "//evil.example", "/\\evil.example"]) {
      const agent = request.agent(configured.getHttpServer());
      const start = await agent.get("/auth/google/start").query({ returnTo: evil });
      fake.willVerify({ sub: randomUUID(), email: email() });
      const callback = await agent.get("/auth/google/callback").query({ code: "code", state: stateOf(start) });
      expect(callback.headers["location"]).toBe(`${WEB}/`);
    }
  });
});

describe("connecting and disconnecting Google", () => {
  it("connects Google to the logged-in account, then disconnects it", async () => {
    const address = email();
    const agent = await loginAgent(configured, address);
    const sub = randomUUID();
    const { callback } = await roundTrip(agent, { sub, email: address }, "/auth/google/link");
    expect(callback.headers["location"]).toBe(`${WEB}/`);
    const me = await agent.get("/auth/me").expect(200);
    expect(me.body).toMatchObject({ hasPassword: true, googleLinked: true, emailVerified: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { email: address } })).toMatchObject({ googleSub: sub });

    await agent.delete("/auth/google").expect(204);
    expect((await agent.get("/auth/me").expect(200)).body).toMatchObject({ googleLinked: false });
    await agent.delete("/auth/google").expect(204); // nothing to do is not an error
  });

  it("refuses a Google identity that already belongs to another account, back on the account screen", async () => {
    const sub = randomUUID();
    await roundTrip(request.agent(configured.getHttpServer()), { sub, email: email() });
    const agent = await loginAgent(configured);
    const { callback } = await roundTrip(agent, { sub, email: email() }, "/auth/google/link");
    expect(callback.headers["location"]).toBe(`${WEB}/settings/account?error=google_taken`);
    expect((await agent.get("/auth/me")).body).toMatchObject({ googleLinked: false });
  });

  it("needs a browser session to start linking: no session is 401 and an API token is 403", async () => {
    await http().get("/auth/google/link").expect(401);
    const agent = await loginAgent(configured);
    const created = await agent.post("/auth/tokens").send({ name: "n8n" }).expect(201);
    const res = await http().get("/auth/google/link").set("Authorization", `Bearer ${(created.body as { token: string }).token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("session_required");
  });

  it("will not disconnect Google while it is the only way in, until a password is set", async () => {
    const address = email();
    const agent = request.agent(configured.getHttpServer());
    await roundTrip(agent, { sub: randomUUID(), email: address });
    const blocked = await agent.delete("/auth/google");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("password_required");

    await agent.put("/auth/password").send({ password: "short" }).expect(400);
    await agent.put("/auth/password").send({ password: TEST_PASSWORD }).expect(204);
    await agent.put("/auth/password").send({ password: TEST_PASSWORD }).expect(409);
    expect((await agent.get("/auth/me")).body).toMatchObject({ hasPassword: true });

    // now it can log in with the password, and Google can be disconnected
    await http().post("/auth/login").send({ email: address, password: TEST_PASSWORD }).expect(200);
    await agent.delete("/auth/google").expect(204);
  });

  it("an API token cannot set a password, and a write from an unknown Origin is refused", async () => {
    const agent = request.agent(configured.getHttpServer());
    await roundTrip(agent, { sub: randomUUID(), email: email() });
    await agent.put("/auth/password").set("Origin", "https://evil.example").send({ password: TEST_PASSWORD }).expect(403);
    await agent.delete("/auth/google").set("Origin", "https://evil.example").expect(403);
    await http().put("/auth/password").send({ password: TEST_PASSWORD }).expect(401);
  });
});
