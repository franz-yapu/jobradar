import {
  normalizeProfileData,
  type CandidateProfile,
  type CandidateProfileData,
} from "../domain/candidate-profile.js";
import type { ProfileRepository } from "../domain/profile.repository.js";

export class SaveProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  execute(data: CandidateProfileData): Promise<CandidateProfile> {
    return this.profiles.save(normalizeProfileData(data));
  }
}
