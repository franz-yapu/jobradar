import { Module } from "@nestjs/common";
import { loadEnv } from "../../config/env.js";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { GetAiUsage } from "../application/get-ai-usage.use-case.js";
import { MeteredAiProvider } from "../application/metered-ai-provider.js";
import { AI_CALL_REPOSITORY, type AiCallRepository } from "../domain/ai-call.js";
import { AI_PROVIDER, type AiProvider } from "../domain/ai-provider.js";
import { AiController } from "./ai.controller.js";
import { createAiProvider } from "./create-ai-provider.js";
import { PrismaAiCallRepository } from "./prisma-ai-call.repository.js";

/** The raw provider, without metering. Other modules must inject AI_PROVIDER instead. */
export const AI_INNER_PROVIDER = Symbol("AI_INNER_PROVIDER");

@Module({
  controllers: [AiController],
  providers: [
    { provide: AI_CALL_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaAiCallRepository(prisma), inject: [PrismaService] },
    { provide: AI_INNER_PROVIDER, useFactory: () => createAiProvider(loadEnv()) },
    {
      provide: AI_PROVIDER,
      useFactory: (inner: AiProvider, calls: AiCallRepository) =>
        new MeteredAiProvider(inner, calls, { dailyBudgetUsd: loadEnv().AI_DAILY_BUDGET_USD }),
      inject: [AI_INNER_PROVIDER, AI_CALL_REPOSITORY],
    },
    {
      provide: GetAiUsage,
      useFactory: (calls: AiCallRepository) => new GetAiUsage(calls, loadEnv().AI_DAILY_BUDGET_USD),
      inject: [AI_CALL_REPOSITORY],
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
