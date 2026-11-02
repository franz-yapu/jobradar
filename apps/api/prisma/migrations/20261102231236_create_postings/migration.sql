-- CreateEnum
CREATE TYPE "RemoteScope" AS ENUM ('worldwide', 'latam', 'country', 'onsite', 'unknown');

-- CreateTable
CREATE TABLE "postings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "location" TEXT,
    "remoteScope" "RemoteScope" NOT NULL,
    "description" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "postings_url_key" ON "postings"("url");

-- CreateIndex
CREATE INDEX "postings_source_idx" ON "postings"("source");

-- CreateIndex
CREATE INDEX "postings_createdAt_idx" ON "postings"("createdAt");
