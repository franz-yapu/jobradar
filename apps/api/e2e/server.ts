import "reflect-metadata";
import { execSync } from "node:child_process";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { setupCors } from "../src/setup-app.js";
import { DeterministicAiProvider } from "./deterministic-ai.provider.js";

/**
 * API for the Playwright end-to-end tests: the real application and a real database, with a deterministic AI.
 * It EMPTIES the database it is pointed at, so it refuses to start unless the name says it is disposable.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"] ?? "";
  const databaseName = databaseUrl.split("?")[0]?.split("/").pop() ?? "";
  if (!/(_test|_e2e)$/.test(databaseName)) {
    throw new Error(`Refusing to run E2E against "${databaseName}": the database name must end in _test or _e2e`);
  }
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: process.env });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_INNER_PROVIDER)
    .useValue(new DeterministicAiProvider())
    .compile();
  const app = moduleRef.createNestApplication();
  setupCors(app, [process.env["WEB_ORIGIN"] ?? "http://localhost:5174"]);
  app.enableShutdownHooks();

  const prisma = app.get(PrismaService);
  await prisma.postingScore.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.candidateProfile.deleteMany();
  // Users cascade to sessions and API tokens; deleting them last also prevents the first
  // registration of a run from adopting rows left by the previous one.
  await prisma.user.deleteMany();

  await app.listen(Number(process.env["PORT"] ?? 3100));
}

void main();
