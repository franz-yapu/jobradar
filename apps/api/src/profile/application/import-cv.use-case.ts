import type { AiProvider } from "../../ai/domain/ai-provider.js";
import type { Education, EnglishLevel, Experience, LanguageSkill, Seniority } from "../domain/candidate-profile.js";
import type { CvDraft, CvWarning } from "../domain/cv-draft.js";
import type { CvTextExtractor } from "../domain/cv-text-extractor.js";
import { buildCvContent, buildCvSystem, CvExtractionSchema, type CvExtraction } from "./import-cv.prompt.js";

/** Characters of CV text sent to the model; the rest is cut (and flagged) to bound cost. */
export const MAX_CV_CHARS = 30_000;
const DEFAULT_ENGLISH_LEVEL: EnglishLevel = "B1";

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/g;
const PROFILE_URL = /(?:https?:\/\/)?(?:[\w-]+\.)?(?:linkedin|github)\.com\/\S*/gi;

/** Removes contact data the model may have copied into free text. Date ranges (8 digits or fewer) are kept. */
export function scrubContactData(text: string): string {
  return text
    .replace(EMAIL, "")
    .replace(PROFILE_URL, "")
    .replace(PHONE_LIKE, (match) => (match.replace(/\D/g, "").length >= 9 ? "" : match))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function clean(text: string, max: number): string {
  const value = scrubContactData(text).replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function validYear(year: number | null): number | undefined {
  return year !== null && Number.isInteger(year) && year >= 1950 && year <= 2100 ? year : undefined;
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function seniorityFromYears(years: number): Seniority {
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  if (years < 9) return "senior";
  return "lead";
}

function toEducation(items: CvExtraction["education"]): Education[] {
  return items
    .map((item): Education => {
      const field = clean(item.field ?? "", 200);
      return {
        institution: clean(item.institution, 200),
        degree: clean(item.degree, 200),
        ...(field ? { field } : {}),
        startYear: validYear(item.startYear),
        endYear: validYear(item.endYear),
      };
    })
    .filter((item) => item.institution && item.degree)
    .slice(0, 10);
}

function toExperience(items: CvExtraction["experience"]): Experience[] {
  return items
    .map((item): Experience => ({
      company: clean(item.company, 200),
      role: clean(item.role, 200),
      startYear: validYear(item.startYear),
      endYear: item.current ? undefined : validYear(item.endYear),
      current: item.current,
      highlights: item.highlights
        .map((highlight) => clean(highlight, 300))
        .filter(Boolean)
        .slice(0, 5),
    }))
    .filter((item) => item.company && item.role)
    .slice(0, 15);
}

function toLanguages(items: CvExtraction["languages"]): LanguageSkill[] {
  return items
    .map((item) => ({ language: clean(item.language, 60), level: clean(item.level, 60) }))
    .filter((item) => item.language && item.level)
    .slice(0, 10);
}

/**
 * Turns a CV (PDF) into a profile draft. Nothing is stored: the candidate reviews the draft and saves it
 * through the normal profile endpoint. Contact data is never asked for and is scrubbed if it shows up.
 */
export class ImportCv {
  constructor(
    private readonly extractor: CvTextExtractor,
    private readonly ai: AiProvider,
  ) {}

  async execute(userId: string, file: Buffer): Promise<CvDraft> {
    const fullText = await this.extractor.extract(file);
    const truncated = fullText.length > MAX_CV_CHARS;
    const text = truncated ? fullText.slice(0, MAX_CV_CHARS) : fullText;

    const result = await this.ai.generateStructured({
      userId,
      purpose: "cv_extraction",
      system: buildCvSystem(),
      content: buildCvContent(text),
      schema: CvExtractionSchema,
    });
    return this.toDraft(result.data, truncated);
  }

  private toDraft(data: CvExtraction, truncated: boolean): CvDraft {
    const warnings: CvWarning[] = [];

    const stack = uniqueCaseInsensitive(data.stack.map((item) => clean(item, 50)).filter(Boolean)).slice(0, 50);
    if (stack.length === 0) warnings.push("no_stack");

    const country = data.countryOfResidence?.trim().toUpperCase() ?? "";
    const allowedLocations = /^[A-Z]{2}$/.test(country) ? [country] : [];
    if (allowedLocations.length === 0) warnings.push("location_missing");

    let seniority: Seniority = "mid";
    if (data.yearsOfExperience !== null && data.yearsOfExperience >= 0) {
      seniority = seniorityFromYears(data.yearsOfExperience);
      warnings.push("seniority_estimated");
    } else {
      warnings.push("seniority_missing");
    }

    if (data.englishLevel === null) warnings.push("english_level_missing");

    const education = toEducation(data.education);
    const experience = toExperience(data.experience);
    if (experience.length === 0) warnings.push("no_experience");
    if (education.length === 0) warnings.push("no_education");
    if (truncated) warnings.push("text_truncated");

    return {
      stack,
      seniority,
      allowedLocations,
      maxEnglishLevel: data.englishLevel ?? DEFAULT_ENGLISH_LEVEL,
      excludedContractTypes: [],
      summary: clean(data.summary, 2000),
      education,
      experience,
      languages: toLanguages(data.languages),
      certifications: uniqueCaseInsensitive(data.certifications.map((item) => clean(item, 200)).filter(Boolean)).slice(0, 20),
      warnings,
    };
  }
}
