/**
 * promptfoo custom provider: runs the REAL scoring pipeline (prompt builders, Claude adapter,
 * verdict invariant) for one labelled posting. Model comes from AI_MODEL, key from ANTHROPIC_API_KEY.
 * Cost: every call is billed. Run only with explicit approval (`pnpm --filter @jobradar/api eval`).
 */
import { AiError, AiNotConfiguredError } from "../src/ai/domain/ai-provider.js";
import { createAiProvider } from "../src/ai/infrastructure/create-ai-provider.js";
import { loadEnv } from "../src/config/env.js";
import {
  ScoringOutputSchema,
  buildScoringContent,
  buildScoringSystem,
} from "../src/scoring/application/score-posting.prompt.js";
import { enforceVerdictInvariant } from "../src/scoring/domain/posting-score.js";
import type { CandidateProfileData } from "../src/profile/domain/candidate-profile.js";
import type { Posting, RemoteScope } from "../src/postings/domain/posting.js";

interface CaseVars {
  profile: CandidateProfileData;
  posting: { title: string; company: string; location?: string; remoteScope: RemoteScope; description: string };
}

interface CallContext {
  vars: Record<string, unknown>;
}

interface ProviderResponse {
  output?: string;
  error?: string;
  cost?: number;
  latencyMs?: number;
  tokenUsage?: { total: number; prompt: number; completion: number };
  metadata?: Record<string, unknown>;
}

export default class ScoringEvalProvider {
  id(): string {
    return "jobradar-scoring";
  }

  async callApi(_prompt: string, context: CallContext): Promise<ProviderResponse> {
    const { profile, posting } = context.vars as unknown as CaseVars;
    const ai = createAiProvider(loadEnv());
    const now = new Date();
    const startedAt = Date.now();
    try {
      const result = await ai.generateStructured({
        purpose: "scoring",
        system: buildScoringSystem({ ...profile, version: 1, updatedAt: now }),
        content: buildScoringContent({
          id: "eval",
          url: "https://eval.invalid",
          source: "eval",
          location: posting.location ?? null,
          publishedAt: null,
          createdAt: now,
          ...posting,
        } satisfies Posting),
        schema: ScoringOutputSchema,
      });
      const { verdict, reasons, blockers } = result.data;
      const latencyMs = Date.now() - startedAt;
      return {
        output: JSON.stringify({ verdict: enforceVerdictInvariant(verdict, blockers), reasons, blockers }),
        cost: result.usage.costUsd,
        latencyMs,
        tokenUsage: {
          prompt: result.usage.inputTokens,
          completion: result.usage.outputTokens,
          total: result.usage.inputTokens + result.usage.outputTokens,
        },
        metadata: { model: result.model, latencyMs },
      };
    } catch (error) {
      const cost = error instanceof AiError && error.usage ? error.usage.costUsd : 0;
      const hint = error instanceof AiNotConfiguredError ? " (set ANTHROPIC_API_KEY in .env)" : "";
      return { error: `${error instanceof Error ? error.message : String(error)}${hint}`, cost };
    }
  }
}
