import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { currentUserId, loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const http = () => request(app.getHttpServer());

async function newToken(agent: Agent, name = "n8n"): Promise<{ id: string; token: string }> {
  const res = await agent.post("/auth/tokens").send({ name }).expect(201);
  return { id: res.body.id as string, token: res.body.token as string };
}

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});

describe("creating and listing tokens", () => {
  it("shows the secret once, stores only its hash and never lists it", async () => {
    const agent = await loginAgent(app);
    const created = await agent.post("/auth/tokens").send({ name: "  n8n  " });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "n8n", lastUsedAt: null, revokedAt: null });
    const token = created.body.token as string;
    expect(token).toMatch(/^jr_[A-Za-z0-9_-]{43}$/);
    expect(created.body.prefix).toBe(token.slice(0, 8));

    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: created.body.id as string } });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(token);

    const list = await agent.get("/auth/tokens").expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(token);
    expect(list.body[0]).not.toHaveProperty("token");
    expect(list.body[0]).not.toHaveProperty("tokenHash");
  });

  it("validates the name and limits the active tokens", async () => {
    const agent = await loginAgent(app);
    await agent.post("/auth/tokens").send({ name: "   " }).expect(400);
    await agent.post("/auth/tokens").send({}).expect(400);
    const first = await newToken(agent, "t0");
    for (let i = 1; i < 10; i += 1) await newToken(agent, `t${i}`);

    const over = await agent.post("/auth/tokens").send({ name: "eleven" });
    expect(over.status).toBe(409);
    expect(over.body.error).toBe("too_many_tokens");

    await agent.delete(`/auth/tokens/${first.id}`).expect(204);
    await agent.post("/auth/tokens").send({ name: "after revoking" }).expect(201);
  });

  it("lists only the account's own tokens", async () => {
    const a = await loginAgent(app);
    const b = await loginAgent(app);
    await newToken(a, "a-token");
    await newToken(b, "b-token");
    expect((await a.get("/auth/tokens")).body.map((t: { name: string }) => t.name)).toEqual(["a-token"]);
    expect((await b.get("/auth/tokens")).body.map((t: { name: string }) => t.name)).toEqual(["b-token"]);
  });

  it("needs a login", async () => {
    await http().get("/auth/tokens").expect(401);
    await http().post("/auth/tokens").send({ name: "x" }).expect(401);
    await http().delete("/auth/tokens/00000000-0000-4000-8000-000000000000").expect(401);
  });
});

describe("using a token", () => {
  it("acts as its owner on the protected endpoints, with no cookie", async () => {
    const agent = await loginAgent(app);
    const { token } = await newToken(agent);
    const created = await http()
      .post("/postings")
      .set(bearer(token))
      .send({ title: "From n8n", company: "Acme", url: "https://acme.com/n8n-1", source: "getonboard", remoteScope: "latam", description: "x" });
    expect(created.status).toBe(201);

    // the browser session of the same account sees what the token created
    const list = (await agent.get("/postings")).body as { items: { title: string }[] };
    expect(list.items.map((p) => p.title)).toContain("From n8n");
    expect((await http().get("/postings").set(bearer(token))).status).toBe(200);
    expect((await http().get("/auth/me").set(bearer(token))).body.id).toBe(await currentUserId(agent));
  });

  it("is scoped to its owner: it cannot read or score another account's data", async () => {
    const a = await loginAgent(app);
    const b = await loginAgent(app);
    const { token: tokenA } = await newToken(a);
    const postingB = (
      await b.post("/postings").send({ title: "B only", company: "Acme", url: "https://acme.com/b", source: "manual", remoteScope: "latam", description: "x" }).expect(201)
    ).body.id as string;

    expect((await http().get("/postings").set(bearer(tokenA))).body.total).toBe(0);
    expect((await http().post(`/postings/${postingB}/score`).set(bearer(tokenA))).status).toBe(404);
    expect((await http().get(`/postings/${postingB}/score`).set(bearer(tokenA))).status).toBe(404);
    expect(fake.requests).toHaveLength(0);
  });

  it("records when it was last used", async () => {
    const agent = await loginAgent(app);
    const { id, token } = await newToken(agent);
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt).toBeNull();
    await http().get("/postings").set(bearer(token)).expect(200);
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt).not.toBeNull();
    expect(((await agent.get("/auth/tokens")).body as { lastUsedAt: string | null }[])[0]?.lastUsedAt).not.toBeNull();
  });

  it("is not subject to the Origin check, because it does not depend on the cookie", async () => {
    const agent = await loginAgent(app);
    const { token } = await newToken(agent);
    const res = await http().post("/postings").set(bearer(token)).set("Origin", "https://n8n.internal.example").send({});
    expect(res.status).toBe(400); // passed the guards, refused only for the empty body
  });
});

describe("rejecting tokens", () => {
  it("answers 401 for a made-up, malformed or foreign token", async () => {
    for (const header of ["Bearer jr_madeup", "Bearer notatoken", "Bearer ", "Bearer", "Basic dXNlcjpwYXNz", "jr_madeup"]) {
      const res = await http().get("/postings").set("Authorization", header);
      expect(res.status, header).toBe(401);
    }
  });

  it("does not fall back to a valid cookie when the Bearer token is bad", async () => {
    const agent = await loginAgent(app);
    await agent.get("/postings").expect(200);
    const res = await agent.get("/postings").set("Authorization", "Bearer jr_madeup");
    expect(res.status).toBe(401);
  });

  it("stops working the moment it is revoked, and revoking twice is harmless", async () => {
    const agent = await loginAgent(app);
    const { id, token } = await newToken(agent);
    await http().get("/postings").set(bearer(token)).expect(200);

    await agent.delete(`/auth/tokens/${id}`).expect(204);
    await http().get("/postings").set(bearer(token)).expect(401);
    await agent.delete(`/auth/tokens/${id}`).expect(204);
    const listed = (await agent.get("/auth/tokens")).body as { id: string; revokedAt: string | null }[];
    expect(listed.find((t) => t.id === id)?.revokedAt).not.toBeNull();
  });

  it("cannot revoke another account's token: 404, and it keeps working", async () => {
    const a = await loginAgent(app);
    const b = await loginAgent(app);
    const { id, token } = await newToken(a);
    expect((await b.delete(`/auth/tokens/${id}`)).status).toBe(404);
    await http().get("/postings").set(bearer(token)).expect(200);
    await b.delete("/auth/tokens/not-a-uuid").expect(400);
  });

  it("stops working when the account is deleted", async () => {
    const agent = await loginAgent(app);
    const { token } = await newToken(agent);
    await prisma.user.delete({ where: { id: await currentUserId(agent) } });
    await http().get("/postings").set(bearer(token)).expect(401);
  });
});

describe("tokens cannot manage tokens", () => {
  it("answers 403 session_required for list, create and revoke with a token", async () => {
    const agent = await loginAgent(app);
    const { id, token } = await newToken(agent);

    for (const res of [
      await http().get("/auth/tokens").set(bearer(token)),
      await http().post("/auth/tokens").set(bearer(token)).send({ name: "minted by a token" }),
      await http().delete(`/auth/tokens/${id}`).set(bearer(token)),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("session_required");
    }
    // nothing changed: the token is still active and no token was minted
    expect(((await agent.get("/auth/tokens")).body as unknown[]).length).toBe(1);
    await http().get("/postings").set(bearer(token)).expect(200);
  });
});
