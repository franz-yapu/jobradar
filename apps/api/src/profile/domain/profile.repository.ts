import type { CandidateProfile, CandidateProfileData } from "./candidate-profile.js";

export const PROFILE_REPOSITORY = Symbol("PROFILE_REPOSITORY");

export class ProfileNotFoundError extends Error {
  constructor() {
    super("The candidate profile has not been configured yet");
    this.name = "ProfileNotFoundError";
  }
}

export interface ProfileRepository {
  get(): Promise<CandidateProfile | null>;
  /** Creates the profile (version 1) or replaces it and increments the version, atomically. */
  save(data: CandidateProfileData): Promise<CandidateProfile>;
}
