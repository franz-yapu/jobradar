import type { CandidateProfile, CandidateProfileData } from "./candidate-profile.js";

export const PROFILE_REPOSITORY = Symbol("PROFILE_REPOSITORY");

export class ProfileNotFoundError extends Error {
  constructor() {
    super("The candidate profile has not been configured yet");
    this.name = "ProfileNotFoundError";
  }
}

/** One profile per account. */
export interface ProfileRepository {
  get(userId: string): Promise<CandidateProfile | null>;
  /** Creates the account's profile (version 1) or replaces it and increments the version, atomically. */
  save(userId: string, data: CandidateProfileData): Promise<CandidateProfile>;
}
