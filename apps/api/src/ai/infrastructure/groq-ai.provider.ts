import { z } from "zod";
import {
  AiNotConfiguredError,
  AiProviderError,
  type AiProvider,
  type AiResult,
  type AiUsage,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";
import { costUsd, priceFor, PRICES_AS_OF } from "./pricing.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqAiOptions {
  maxTokens?: number;
  timeoutMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  url?: string;
}

interface GroqResponse {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
}

/**
 * AiProvider for Groq's OpenAI-compatible chat API. Uses JSON mode (supported by every Groq chat
 * model) with the JSON Schema spelled out in the system prompt; the answer is always re-validated
 * with the Zod schema. Used for cheap trials: production scoring is tuned for Claude.
 */
export class GroqAiProvider implements AiProvider {
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly url: string;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    options: GroqAiOptions = {},
  ) {
    if (!priceFor(model)) {
      throw new AiNotConfiguredError(
        `No price known for model "${model}" (prices as of ${PRICES_AS_OF}); add it to ai/infrastructure/pricing.ts`,
      );
    }
    this.maxTokens = options.maxTokens ?? 4000;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchFn = options.fetch ?? fetch;
    this.url = options.url ?? GROQ_URL;
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<AiResult<T>> {
    const schema = JSON.stringify(z.toJSONSchema(request.schema));
    const system = `${request.system}\n\nAnswer with a single JSON object that validates against this JSON Schema, and nothing else:\n${schema}`;

    let response: Response;
    try {
      response = await this.fetchFn(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: request.content },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new AiProviderError("Could not reach Groq", undefined, { cause });
    }

    const body = (await response.json().catch(() => ({}))) as GroqResponse;
    if (!response.ok) throw mapHttpError(response.status, body);

    const usage = usageOf(body, this.model);
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") throw new AiProviderError("The response was cut off (max_tokens)", usage);

    let json: unknown;
    try {
      json = JSON.parse(choice?.message?.content ?? "");
    } catch (cause) {
      throw new AiProviderError("The model did not return valid JSON", usage, { cause });
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiProviderError(`The answer does not match the expected schema: ${parsed.error.message}`, usage);
    }
    return { data: parsed.data, usage, model: body.model ?? this.model };
  }
}

function usageOf(body: GroqResponse, model: string): AiUsage {
  const prompt = body.usage?.prompt_tokens ?? 0;
  const cached = Math.min(body.usage?.prompt_tokens_details?.cached_tokens ?? 0, prompt);
  const tokens = {
    inputTokens: prompt - cached,
    outputTokens: body.usage?.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
  return { ...tokens, costUsd: Math.round(costUsd(body.model ?? model, tokens) * 1e6) / 1e6 };
}

function mapHttpError(status: number, body: GroqResponse): Error {
  const detail = body.error?.message ? `: ${body.error.message}` : "";
  if (status === 401 || status === 403) return new AiNotConfiguredError(`Groq rejected the API key${detail}`);
  if (status === 429) return new AiProviderError(`Groq rate limit reached${detail}`);
  return new AiProviderError(`Groq API error ${status}${detail}`);
}
