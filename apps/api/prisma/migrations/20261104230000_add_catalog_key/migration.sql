-- AlterTable
ALTER TABLE "postings" ADD COLUMN     "catalogKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "postings_catalogKey_key" ON "postings"("catalogKey");

