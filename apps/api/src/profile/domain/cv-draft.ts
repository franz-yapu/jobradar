import type { CandidateProfileData } from "./candidate-profile.js";

/** Notes about what the import could not find or had to guess; the UI translates each code. */
export const CV_WARNINGS = [
  "no_stack",
  "location_missing",
  "seniority_estimated",
  "seniority_missing",
  "english_level_missing",
  "no_experience",
  "no_education",
  "text_truncated",
  "locations_suggested",
  "dates_incomplete",
] as const;
export type CvWarning = (typeof CV_WARNINGS)[number];

/**
 * What a CV yields: profile data the candidate still has to review. It is never stored by the import;
 * the stack and locations may be empty when the CV did not say.
 */
export interface CvDraft extends CandidateProfileData {
  warnings: CvWarning[];
}
