import type { AiProvider, AiResult, GenerateStructuredRequest } from "../src/ai/domain/ai-provider.js";

/**
 * AI stand-in for end-to-end tests: no network, no cost, same answer for the same posting.
 * A posting that mentions "C2" is rejected for English; anything else is a fit.
 */
export class DeterministicAiProvider implements AiProvider {
  readonly model = "e2e-deterministic";

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    const needsC2 = /\bC2\b/.test(request.content);
    const answer = needsC2
      ? {
          verdict: "reject",
          reasons: ["Requires C2 English"],
          blockers: [{ type: "english", evidence: "Proficient English (C2) required" }],
        }
      : { verdict: "fit", reasons: ["Stack matches the profile"], blockers: [] };
    return {
      data: request.schema.parse(answer),
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
      model: this.model,
    };
  }
}
