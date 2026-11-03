import type { CandidateProfile, CandidateProfileData } from "../domain/candidate-profile.js";
import type { ProfileRepository } from "../domain/profile.repository.js";

export class InMemoryProfileRepository implements ProfileRepository {
  private profile: CandidateProfile | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get(): Promise<CandidateProfile | null> {
    return this.profile;
  }

  async save(data: CandidateProfileData): Promise<CandidateProfile> {
    this.profile = { ...data, version: (this.profile?.version ?? 0) + 1, updatedAt: this.now() };
    return this.profile;
  }
}
