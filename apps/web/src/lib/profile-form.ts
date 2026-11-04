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
