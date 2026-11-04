import { EducationSchema, ExperienceSchema, LanguageSkillSchema } from "@jobradar/shared";
import { z } from "zod";
import type { CandidateProfile as ProfileRow } from "../../generated/prisma/client.js";
import type { InputJsonValue } from "../../generated/prisma/internal/prismaNamespace.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { CandidateProfile, CandidateProfileData } from "../domain/candidate-profile.js";
import type { ProfileRepository } from "../domain/profile.repository.js";

const PROFILE_ID = "default";

/** Json columns store plain data: drops `undefined` fields and gives Prisma a JSON-typed value. */
function toJson<T>(value: T[]): InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as InputJsonValue;
}

function toRow(data: CandidateProfileData) {
  return {
    ...data,
    education: toJson(data.education),
    experience: toJson(data.experience),
    languages: toJson(data.languages),
  };
}

function toDomain(row: ProfileRow): CandidateProfile {
  const { id: _id, ...profile } = row;
  return {
    ...profile,
    education: z.array(EducationSchema).parse(row.education),
    experience: z.array(ExperienceSchema).parse(row.experience),
    languages: z.array(LanguageSkillSchema).parse(row.languages),
    certifications: row.certifications ?? [],
  };
}

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<CandidateProfile | null> {
    const row = await this.prisma.candidateProfile.findUnique({ where: { id: PROFILE_ID } });
    return row ? toDomain(row) : null;
  }

  async save(data: CandidateProfileData): Promise<CandidateProfile> {
    const row = await this.prisma.candidateProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...toRow(data), version: 1 },
      update: { ...toRow(data), version: { increment: 1 } },
    });
    return toDomain(row);
  }
}
