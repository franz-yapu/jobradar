import type { AiProvider, AiResult, GenerateStructuredRequest } from "../src/ai/domain/ai-provider.js";

/** What the fake "reads" from any uploaded CV. No country on purpose, so the E2E exercises the warning. */
const CV_EXTRACTION = {
  stack: ["TypeScript", "NestJS", "PostgreSQL"],
  yearsOfExperience: 7,
  countryOfResidence: null,
  englishLevel: "B1",
  summary: "Backend developer who builds APIs.",
  education: [{ institution: "UMSA", degree: "BSc Informatics", field: "Informatics", startYear: 2008, startMonth: 3, endYear: 2013, endMonth: 12 }],
  experience: [
    { company: "Acme", role: "Backend Developer", startYear: 2020, startMonth: 3, endYear: null, endMonth: null, current: true, highlights: ["Built the billing API"] },
  ],
  languages: [{ language: "English", level: "B1" }],
  certifications: ["AWS Cloud Practitioner"],
};

/**
 * AI stand-in for end-to-end tests: no network, no cost, same answer for the same posting.
 * Scoring: a posting that mentions "C2" is rejected for English; anything else is a fit.
 * CV extraction: always the same fixed extraction, whatever the PDF says.
 */
export class DeterministicAiProvider implements AiProvider {
  readonly model = "e2e-deterministic";

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    if (request.purpose === "cv_extraction") return this.result(request, CV_EXTRACTION);
    const needsC2 = /\bC2\b/.test(request.content);
    const answer = needsC2
      ? {
          verdict: "reject",
          reasons: ["Requires C2 English"],
          blockers: [{ type: "english", evidence: "Proficient English (C2) required" }],
        }
      : { verdict: "fit", reasons: ["Stack matches the profile"], blockers: [] };
    return this.result(request, answer);
  }

  private result<T>(request: GenerateStructuredRequest<T>, answer: unknown): AiResult<T> {
    return {
      data: request.schema.parse(answer),
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
      model: this.model,
    };
  }
}
