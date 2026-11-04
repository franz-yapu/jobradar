import { z } from "zod";

export const SENIORITIES = ["junior", "mid", "senior", "lead"] as const;
export const SenioritySchema = z.enum(SENIORITIES);
export type Seniority = z.infer<typeof SenioritySchema>;

export const ENGLISH_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const EnglishLevelSchema = z.enum(ENGLISH_LEVELS);
export type EnglishLevel = z.infer<typeof EnglishLevelSchema>;

export const CONTRACT_TYPES = ["temporary", "freelance", "internship", "part_time"] as const;
export const ContractTypeSchema = z.enum(CONTRACT_TYPES);
export type ContractType = z.infer<typeof ContractTypeSchema>;

/** ISO 3166-1 alpha-2 country code (uppercase) or one of the region keywords. */
export const LocationSchema = z.string().regex(/^([A-Z]{2}|worldwide|latam)$/, {
  message: "Use an ISO country code (e.g. BO), 'latam' or 'worldwide'",
});

const trimmed = (max: number) => z.string().trim().min(1).max(max);

const optionalYear = z.number().int().min(1950).max(2100).optional();
const optionalMonth = z.number().int().min(1).max(12).optional();

interface Span {
  startYear?: number | undefined;
  startMonth?: number | undefined;
  endYear?: number | undefined;
  endMonth?: number | undefined;
}

/** A month only makes sense with its year, and the end cannot come before the start. */
function spanIsConsistent(span: Span): boolean {
  if (span.startMonth !== undefined && span.startYear === undefined) return false;
  if (span.endMonth !== undefined && span.endYear === undefined) return false;
  if (span.startYear === undefined || span.endYear === undefined) return true;
  const start = span.startYear * 12 + (span.startMonth ?? 1);
  const end = span.endYear * 12 + (span.endMonth ?? 12);
  return end >= start;
}
const SPAN_MESSAGE = { message: "The end date cannot be before the start date, and a month needs its year" };

export const EducationSchema = z.object({
  institution: trimmed(200),
  degree: trimmed(200),
  field: trimmed(200).optional(),
  startYear: optionalYear,
  startMonth: optionalMonth,
  endYear: optionalYear,
  endMonth: optionalMonth,
}).refine(spanIsConsistent, SPAN_MESSAGE);
export type Education = z.infer<typeof EducationSchema>;

export const ExperienceSchema = z.object({
  company: trimmed(200),
  role: trimmed(200),
  startYear: optionalYear,
  startMonth: optionalMonth,
  /** Absent while `current` is true. */
  endYear: optionalYear,
  endMonth: optionalMonth,
  current: z.boolean().default(false),
  highlights: z.array(trimmed(300)).max(5).default([]),
}).refine((job) => (job.current ? true : spanIsConsistent(job)) && (!job.current || spanIsConsistent({ ...job, endYear: undefined, endMonth: undefined })), SPAN_MESSAGE);
export type Experience = z.infer<typeof ExperienceSchema>;

export const LanguageSkillSchema = z.object({
  language: trimmed(60),
  /** CEFR level (A1-C2) when stated; free text such as "native" otherwise. */
  level: trimmed(60),
});
export type LanguageSkill = z.infer<typeof LanguageSkillSchema>;

export const SaveProfileSchema = z.object({
  stack: z.array(trimmed(50)).min(1).max(50),
  seniority: SenioritySchema,
  allowedLocations: z.array(LocationSchema).min(1).max(30),
  maxEnglishLevel: EnglishLevelSchema,
  excludedContractTypes: z.array(ContractTypeSchema).max(CONTRACT_TYPES.length).default([]),
  summary: z.string().trim().max(2000).default(""),
  /** Academic and professional background; filled by the CV import or by hand. All optional. */
  education: z.array(EducationSchema).max(10).default([]),
  experience: z.array(ExperienceSchema).max(15).default([]),
  languages: z.array(LanguageSkillSchema).max(10).default([]),
  certifications: z.array(trimmed(200)).max(20).default([]),
});
export type SaveProfileInput = z.input<typeof SaveProfileSchema>;
export type SaveProfileBody = z.output<typeof SaveProfileSchema>;

export const ProfileSchema = SaveProfileSchema.extend({
  excludedContractTypes: z.array(ContractTypeSchema),
  summary: z.string(),
  education: z.array(EducationSchema),
  experience: z.array(ExperienceSchema),
  languages: z.array(LanguageSkillSchema),
  certifications: z.array(z.string()),
  version: z.number().int().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ProfileResponse = z.infer<typeof ProfileSchema>;

/** Things the import could not find or had to guess; the UI translates each code. */
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
export const CvWarningSchema = z.enum(CV_WARNINGS);
export type CvWarning = z.infer<typeof CvWarningSchema>;

/**
 * Result of importing a CV: the same shape as what the profile form saves, plus warning codes. It is a draft:
 * nothing is stored until the candidate completes it and saves the profile, so unlike `SaveProfileSchema`
 * the stack and locations may still be empty.
 */
export const CvDraftSchema = SaveProfileSchema.extend({
  stack: z.array(trimmed(50)).max(50),
  allowedLocations: z.array(LocationSchema).max(30),
  warnings: z.array(CvWarningSchema).default([]),
});
export type CvDraft = z.output<typeof CvDraftSchema>;
