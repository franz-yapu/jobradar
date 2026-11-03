import type { ProfileResponse } from "@jobradar/shared";
import type { CandidateProfile } from "../domain/candidate-profile.js";

export function toProfileResponse(profile: CandidateProfile): ProfileResponse {
  return { ...profile, updatedAt: profile.updatedAt.toISOString() };
}
