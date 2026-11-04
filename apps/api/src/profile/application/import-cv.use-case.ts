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

function validMonth(month: number | null, year: number | undefined): number | undefined {
  return year !== undefined && month !== null && Number.isInteger(month) && month >= 1 && month <= 12 ? month : undefined;
}

interface Span {
  startYear: number | undefined;
  startMonth: number | undefined;
  endYear: number | undefined;
  endMonth: number | undefined;
}

/** Years and months from the model, cleaned. An end before the start is dropped and reported. */
function toSpan(item: { startYear: number | null; startMonth: number | null; endYear: number | null; endMonth: number | null }, open: boolean): { span: Span; incomplete: boolean } {
  const startYear = validYear(item.startYear);
  const startMonth = validMonth(item.startMonth, startYear);
  let endYear = open ? undefined : validYear(item.endYear);
  let endMonth = validMonth(item.endMonth, endYear);
  let incomplete = startYear === undefined;
  if (startYear !== undefined && endYear !== undefined) {
    const start = startYear * 12 + (startMonth ?? 1);
    const end = endYear * 12 + (endMonth ?? 12);
    if (end < start) {
      endYear = undefined;
      endMonth = undefined;
      incomplete = true;
    }
  }
  return { span: { startYear, startMonth, endYear, endMonth }, incomplete };
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

function toEducation(items: CvExtraction["education"], flags: { incomplete: boolean }): Education[] {
  return items
    .map((item): Education => {
      const field = clean(item.field ?? "", 200);
      const { span, incomplete } = toSpan(item, false);
      // a study with no start date is common; only a contradictory range counts as a problem
      if (incomplete && span.startYear !== undefined) flags.incomplete = true;
      return { institution: clean(item.institution, 200), degree: clean(item.degree, 200), ...(field ? { field } : {}), ...span };
    })
    .filter((item) => item.institution && item.degree)
    .slice(0, 10);
}

function toExperience(items: CvExtraction["experience"], flags: { incomplete: boolean }): Experience[] {
  return items
    .map((item): Experience => {
      const { span, incomplete } = toSpan(item, item.current);
      if (incomplete) flags.incomplete = true;
      return {
        company: clean(item.company, 200),
        role: clean(item.role, 200),
        ...span,
        current: item.current,
        highlights: item.highlights
          .map((highlight) => clean(highlight, 300))
          .filter(Boolean)
          .slice(0, 5),
      };
    })
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
    // Where the candidate may work is a preference, not a CV fact: with a country we propose it plus LatAm
    // and say so, so the candidate reviews it.
    const allowedLocations = /^[A-Z]{2}$/.test(country) ? [country, "latam"] : [];
    warnings.push(allowedLocations.length === 0 ? "location_missing" : "locations_suggested");

    let seniority: Seniority = "mid";
    if (data.yearsOfExperience !== null && data.yearsOfExperience >= 0) {
      seniority = seniorityFromYears(data.yearsOfExperience);
      warnings.push("seniority_estimated");
    } else {
      warnings.push("seniority_missing");
    }

    if (data.englishLevel === null) warnings.push("english_level_missing");

    const flags = { incomplete: false };
    const education = toEducation(data.education, flags);
    const experience = toExperience(data.experience, flags);
    if (flags.incomplete) warnings.push("dates_incomplete");
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
