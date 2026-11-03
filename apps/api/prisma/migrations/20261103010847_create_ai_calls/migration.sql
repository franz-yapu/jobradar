-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('ok', 'error', 'refused', 'budget_blocked');

-- CreateTable
CREATE TABLE "ai_calls" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiCallStatus" NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL,
    "cacheWriteTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_calls_createdAt_idx" ON "ai_calls"("createdAt");
