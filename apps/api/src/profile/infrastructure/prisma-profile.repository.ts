import type { CandidateProfile as ProfileRow } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { CandidateProfile, CandidateProfileData } from "../domain/candidate-profile.js";
import type { ProfileRepository } from "../domain/profile.repository.js";

const PROFILE_ID = "default";

function toDomain(row: ProfileRow): CandidateProfile {
  const { id: _id, ...profile } = row;
  return profile;
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
      create: { id: PROFILE_ID, ...data, version: 1 },
      update: { ...data, version: { increment: 1 } },
    });
    return toDomain(row);
  }
}
