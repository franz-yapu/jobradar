-- DropIndex
DROP INDEX "postings_url_key";

-- AlterTable
ALTER TABLE "ai_calls" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "candidate_profiles" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "posting_scores" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "postings" ADD COLUMN     "userId" UUID;

-- CreateIndex
CREATE INDEX "ai_calls_userId_createdAt_idx" ON "ai_calls"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_userId_key" ON "candidate_profiles"("userId");

-- CreateIndex
CREATE INDEX "posting_scores_userId_idx" ON "posting_scores"("userId");

-- CreateIndex
CREATE INDEX "postings_userId_createdAt_idx" ON "postings"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "postings_userId_url_key" ON "postings"("userId", "url");

-- AddForeignKey
ALTER TABLE "postings" ADD CONSTRAINT "postings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_scores" ADD CONSTRAINT "posting_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
