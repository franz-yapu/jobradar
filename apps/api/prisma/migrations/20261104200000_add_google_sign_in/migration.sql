-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "googleSub" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "oauth_flows" (
    "id" UUID NOT NULL,
    "stateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "userId" UUID,
    "returnTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_flows_stateHash_key" ON "oauth_flows"("stateHash");

-- CreateIndex
CREATE INDEX "oauth_flows_expiresAt_idx" ON "oauth_flows"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");

