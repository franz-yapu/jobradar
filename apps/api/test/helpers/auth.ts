import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../../src/shared/infrastructure/prisma/prisma.service.js";

export const TEST_PASSWORD = "correct horse battery";
const TEST_DOMAIN = "@test.jobradar.local";

export type Agent = ReturnType<typeof request.agent>;

/** An HTTP client that keeps the session cookie, logged in as a brand-new account. */
export async function loginAgent(app: INestApplication, email = `user-${randomUUID()}${TEST_DOMAIN}`): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/auth/register").send({ email, password: TEST_PASSWORD }).expect(201);
  return agent;
}

/** The id of the account the agent is logged in as. */
export async function currentUserId(agent: Agent): Promise<string> {
  const res = await agent.get("/auth/me").expect(200);
  return (res.body as { id: string }).id;
}

/** Removes the accounts the tests created (their sessions go with them). */
export async function removeTestUsers(app: INestApplication): Promise<void> {
  await app.get(PrismaService).user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
}
