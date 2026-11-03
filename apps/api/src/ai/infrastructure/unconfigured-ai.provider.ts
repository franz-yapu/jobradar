import {
  AiNotConfiguredError,
  type AiProvider,
  type AiResult,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";

/** Used when ANTHROPIC_API_KEY is missing so the API still boots; every call explains what to do. */
export class UnconfiguredAiProvider implements AiProvider {
  constructor(readonly model: string) {}

  async generateStructured<T>(_request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    throw new AiNotConfiguredError("ANTHROPIC_API_KEY is not set; add it to .env to enable AI features");
  }
}
