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

export const SaveProfileSchema = z.object({
  stack: z.array(trimmed(50)).min(1).max(50),
  seniority: SenioritySchema,
  allowedLocations: z.array(LocationSchema).min(1).max(30),
  maxEnglishLevel: EnglishLevelSchema,
  excludedContractTypes: z.array(ContractTypeSchema).max(CONTRACT_TYPES.length).default([]),
  summary: z.string().trim().max(2000).default(""),
});
export type SaveProfileInput = z.input<typeof SaveProfileSchema>;
export type SaveProfileBody = z.output<typeof SaveProfileSchema>;

export const ProfileSchema = SaveProfileSchema.extend({
  excludedContractTypes: z.array(ContractTypeSchema),
  summary: z.string(),
  version: z.number().int().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ProfileResponse = z.infer<typeof ProfileSchema>;
