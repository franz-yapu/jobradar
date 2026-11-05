import { fieldErrors } from "./profile-errors";
import type {
  ContractType,
  CvDraft,
  Education,
  EnglishLevel,
  Experience,
  LanguageSkill,
  ProfileResponse,
  SaveProfileInput,
  Seniority,
} from "@jobradar/shared";

/** Everything the profile screen edits. Lists are kept as typed objects; the API validates on save. */
export interface ProfileForm {
  stack: string[];
  seniority: Seniority;
  allowedLocations: string[];
  maxEnglishLevel: EnglishLevel;
  excludedContractTypes: ContractType[];
  summary: string;
  education: Education[];
  experience: Experience[];
  languages: LanguageSkill[];
  certifications: string[];
}

export const EMPTY_FORM: ProfileForm = {
  stack: [],
  seniority: "mid",
  allowedLocations: [],
  maxEnglishLevel: "B2",
  excludedContractTypes: [],
  summary: "",
  education: [],
  experience: [],
  languages: [],
  certifications: [],
};

/** Works for a saved profile and for a CV draft (same fields, the draft just may leave some empty). */
export function formFromProfile(source: ProfileResponse | CvDraft): ProfileForm {
  return {
    stack: source.stack,
    seniority: source.seniority,
    allowedLocations: source.allowedLocations,
    maxEnglishLevel: source.maxEnglishLevel,
    excludedContractTypes: source.excludedContractTypes,
    summary: source.summary,
    education: source.education,
    experience: source.experience,
    languages: source.languages,
    certifications: source.certifications,
  };
}

/** Drops the fields the user left blank inside the lists, so empty rows never reach the API. */
export function toSaveBody(form: ProfileForm): SaveProfileInput {
  const text = (value: string | undefined) => value?.trim() || undefined;
  return {
    ...form,
    education: form.education
      .filter((item) => item.institution.trim() && item.degree.trim())
      .map((item) => ({ ...item, field: text(item.field) })),
    experience: form.experience
      .filter((item) => item.company.trim() && item.role.trim())
      .map((item) => ({
        ...item,
        endYear: item.current ? undefined : item.endYear,
        endMonth: item.current ? undefined : item.endMonth,
        highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
      })),
    languages: form.languages.filter((item) => item.language.trim() && item.level.trim()),
  };
}

/** JSON with sorted keys and without undefined values, so two equal forms always give the same text. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * True when the form holds edits that were not saved. Both sides go through `toSaveBody`, so blank rows,
 * trimmed text and key order do not count as edits. A half-filled row is an edit, though: it would be dropped on
 * save, so it must keep Save enabled and show its error.
 */
export function isFormDirty(form: ProfileForm, saved: ProfileResponse | null | undefined): boolean {
  const baseline = saved ? formFromProfile(saved) : EMPTY_FORM;
  return stable(toSaveBody(form)) !== stable(toSaveBody(baseline)) || Object.keys(fieldErrors(form)).length > 0;
}
