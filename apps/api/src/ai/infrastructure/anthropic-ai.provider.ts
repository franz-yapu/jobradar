import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRefusalError,
  type AiProvider,
  type AiResult,
  type AiUsage,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";
import { costUsd, priceFor, PRICES_AS_OF } from "./pricing.js";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Models that support `fallbacks: "default"` (Claude API). Others (e.g. Haiku 5.5) must not send it. */
const FALLBACK_MODELS: ReadonlySet<string> = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

export interface AnthropicAiOptions {
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export class AnthropicAiProvider implements AiProvider {
  private readonly maxTokens: number;
  private readonly effort: NonNullable<AnthropicAiOptions["effort"]>;

  constructor(
    private readonly client: Anthropic,
    readonly model: string,
    options: AnthropicAiOptions = {},
  ) {
    if (!priceFor(model)) {
      throw new AiNotConfiguredError(
        `No price known for model "${model}" (prices as of ${PRICES_AS_OF}); add it to ai/infrastructure/pricing.ts`,
      );
    }
    this.maxTokens = options.maxTokens ?? 8000;
    this.effort = options.effort ?? "medium";
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        // Stable prefix first (cached); the untrusted posting text is the volatile tail.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.content }],
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort, format: zodOutputFormat(request.schema) },
        ...(FALLBACK_MODELS.has(this.model) && { betas: [FALLBACK_BETA], fallbacks: "default" as const }),
      });
    } catch (error) {
      throw mapError(error);
    }

    const usage = usageOf(message, this.model);
    if (message.stop_reason === "refusal") {
      throw new AiRefusalError(message.stop_details?.category ?? null, usage);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiProviderError("The response was cut off (max_tokens)", usage);
    }

    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (cause) {
      throw new AiProviderError("The model did not return valid JSON", usage, { cause });
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiProviderError(`The answer does not match the expected schema: ${parsed.error.message}`, usage);
    }
    return { data: parsed.data, usage, model: message.model };
  }
}

function usageOf(message: Anthropic.Beta.BetaMessage, requestedModel: string): AiUsage {
  const total: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
  const add = (model: string, input: number, output: number, read: number | null, write: number | null): void => {
    const tokens = { inputTokens: input, outputTokens: output, cacheReadTokens: read ?? 0, cacheWriteTokens: write ?? 0 };
    total.inputTokens += tokens.inputTokens;
    total.outputTokens += tokens.outputTokens;
    total.cacheReadTokens += tokens.cacheReadTokens;
    total.cacheWriteTokens += tokens.cacheWriteTokens;
    total.costUsd += costUsd(model, tokens);
  };

  // With server-side fallbacks every hop is its own iteration, possibly on another model.
  const iterations = (message.usage.iterations ?? []).filter(
    (entry) => entry.type === "message" || entry.type === "fallback_message",
  );
  if (iterations.length > 0) {
    for (const it of iterations) {
      add(it.model ?? requestedModel, it.input_tokens, it.output_tokens, it.cache_read_input_tokens, it.cache_creation_input_tokens);
    }
  } else {
    const u = message.usage;
    add(message.model || requestedModel, u.input_tokens, u.output_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens);
  }
  total.costUsd = Math.round(total.costUsd * 1e6) / 1e6;
  return total;
}

function mapError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiNotConfiguredError("Anthropic rejected the API key", undefined, { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError("Anthropic rate limit reached", undefined, { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError(`Anthropic API error${error.status ? ` ${error.status}` : ""}: ${error.message}`, undefined, { cause: error });
  }
  return new AiProviderError("Unexpected error calling Anthropic", undefined, { cause: error });
}
