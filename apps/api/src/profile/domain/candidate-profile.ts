export const SENIORITIES = ["junior", "mid", "senior", "lead"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const ENGLISH_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type EnglishLevel = (typeof ENGLISH_LEVELS)[number];

export const CONTRACT_TYPES = ["temporary", "freelance", "internship", "part_time"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

/** What the candidate edits. */
export interface CandidateProfileData {
  /** Technologies, in the candidate's preferred order. Unique, case-insensitive. */
  stack: string[];
  seniority: Seniority;
  /** ISO country codes (uppercase), `latam` or `worldwide`. */
  allowedLocations: string[];
  /** Highest English level the candidate can work in; postings requiring more are blockers. */
  maxEnglishLevel: EnglishLevel;
  excludedContractTypes: ContractType[];
  summary: string;
}

export interface CandidateProfile extends CandidateProfileData {
  /** Starts at 1 and increments on every save; scores record the version they used. */
  readonly version: number;
  readonly updatedAt: Date;
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Trims and removes duplicates (keeping the first occurrence). */
export function normalizeProfileData(data: CandidateProfileData): CandidateProfileData {
  return {
    ...data,
    stack: uniqueBy(
      data.stack.map((s) => s.trim()).filter(Boolean),
      (s) => s.toLowerCase(),
    ),
    allowedLocations: uniqueBy(data.allowedLocations, (l) => l),
    excludedContractTypes: uniqueBy(data.excludedContractTypes, (c) => c),
    summary: data.summary.trim(),
  };
}
