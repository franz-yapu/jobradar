-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('junior', 'mid', 'senior', 'lead');

-- CreateEnum
CREATE TYPE "EnglishLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('temporary', 'freelance', 'internship', 'part_time');

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" TEXT NOT NULL,
    "stack" TEXT[],
    "seniority" "Seniority" NOT NULL,
    "allowedLocations" TEXT[],
    "maxEnglishLevel" "EnglishLevel" NOT NULL,
    "excludedContractTypes" "ContractType"[],
    "summary" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);
