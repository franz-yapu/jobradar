-- CreateEnum
CREATE TYPE "ScoringJobStatus" AS ENUM ('queued', 'done', 'failed');

-- CreateTable
CREATE TABLE "scoring_batches" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requested" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_jobs" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "postingId" UUID NOT NULL,
    "status" "ScoringJobStatus" NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scoring_batches_userId_createdAt_idx" ON "scoring_batches"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "scoring_jobs_batchId_idx" ON "scoring_jobs"("batchId");

-- CreateIndex
CREATE INDEX "scoring_jobs_status_idx" ON "scoring_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_jobs_batchId_postingId_key" ON "scoring_jobs"("batchId", "postingId");

-- AddForeignKey
ALTER TABLE "scoring_batches" ADD CONSTRAINT "scoring_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_jobs" ADD CONSTRAINT "scoring_jobs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "scoring_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_jobs" ADD CONSTRAINT "scoring_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_jobs" ADD CONSTRAINT "scoring_jobs_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

