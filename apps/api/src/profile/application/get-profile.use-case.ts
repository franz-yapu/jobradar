import type { CandidateProfile } from "../domain/candidate-profile.js";
import { ProfileNotFoundError, type ProfileRepository } from "../domain/profile.repository.js";

export class GetProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(): Promise<CandidateProfile> {
    const profile = await this.profiles.get();
    if (!profile) throw new ProfileNotFoundError();
    return profile;
  }
}
