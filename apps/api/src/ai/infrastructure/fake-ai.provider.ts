import {
  AiProviderError,
  type AiProvider,
  type AiResult,
  type AiUsage,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";

type Step = { kind: "return"; data: unknown; usage: AiUsage; model: string } | { kind: "fail"; error: Error };

const DEFAULT_USAGE: AiUsage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 };

/** Scriptable provider for tests: queue answers with willReturn/willFail, inspect `requests`. */
export class FakeAiProvider implements AiProvider {
  readonly model = "fake-model";
  readonly requests: GenerateStructuredRequest<unknown>[] = [];
  private readonly steps: Step[] = [];

  willReturn(data: unknown, usage: Partial<AiUsage> = {}, model = this.model): this {
    this.steps.push({ kind: "return", data, usage: { ...DEFAULT_USAGE, ...usage }, model });
    return this;
  }

  willFail(error: Error): this {
    this.steps.push({ kind: "fail", error });
    return this;
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    this.requests.push(request);
    const step = this.steps.shift();
    if (!step) throw new Error("FakeAiProvider: no response queued");
    if (step.kind === "fail") throw step.error;
    const parsed = request.schema.safeParse(step.data);
    if (!parsed.success) throw new AiProviderError(`Fake answer does not match the schema: ${parsed.error.message}`, step.usage);
    return { data: parsed.data, usage: step.usage, model: step.model };
  }
}
