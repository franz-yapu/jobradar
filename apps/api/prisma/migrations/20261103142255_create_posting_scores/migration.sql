-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('fit', 'maybe', 'reject');

-- CreateTable
CREATE TABLE "posting_scores" (
    "id" UUID NOT NULL,
    "postingId" UUID NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "reasons" TEXT[],
    "blockers" JSONB NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "aiCallId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posting_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posting_scores_postingId_createdAt_idx" ON "posting_scores"("postingId", "createdAt");

-- AddForeignKey
ALTER TABLE "posting_scores" ADD CONSTRAINT "posting_scores_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_scores" ADD CONSTRAINT "posting_scores_aiCallId_fkey" FOREIGN KEY ("aiCallId") REFERENCES "ai_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
