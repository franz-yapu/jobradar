import type { CandidateProfile, CandidateProfileData } from "../domain/candidate-profile.js";
import type { ProfileRepository } from "../domain/profile.repository.js";

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly profiles = new Map<string, CandidateProfile>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get(userId: string): Promise<CandidateProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async save(userId: string, data: CandidateProfileData): Promise<CandidateProfile> {
    const profile = { ...data, version: (this.profiles.get(userId)?.version ?? 0) + 1, updatedAt: this.now() };
    this.profiles.set(userId, profile);
    return profile;
  }
}
