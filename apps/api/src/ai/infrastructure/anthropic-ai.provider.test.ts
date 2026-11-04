import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRefusalError,
  type GenerateStructuredRequest,
} from "../domain/ai-provider.js";
import { AnthropicAiProvider } from "./anthropic-ai.provider.js";

const schema = z.object({ verdict: z.enum(["fit", "maybe", "reject"]) });
const request: GenerateStructuredRequest<z.infer<typeof schema>> = {
  userId: "user-a",
  purpose: "scoring",
  system: "You score postings.",
  content: "<posting>Backend dev</posting>",
  schema,
};

function messageBody(overrides: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) {
  return {
    id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify({ verdict: "fit" }) }],
    stop_reason: "end_turn", stop_sequence: null, stop_details: null,
    usage: {
      input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      iterations: null, ...usage,
    },
    ...overrides,
  };
}

interface SentBody {
  model: string;
  max_tokens: number;
  thinking: unknown;
  output_config: { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
  system: unknown;
  messages: unknown;
  tool_choice?: unknown;
  fallbacks?: string;
}
interface Sent { headers: Headers; body: SentBody }

function first(sent: Sent[]): Sent {
  const request = sent[0];
  if (!request) throw new Error("no request was sent");
  return request;
}

/** Real SDK client whose HTTP layer is replaced, so the actual request/response handling is exercised. */
function setup(respond: () => { status?: number; body: unknown }, model = "claude-sonnet-5-5") {
  const sent: Sent[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      sent.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as SentBody });
      const { status = 200, body } = respond();
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  });
  return { provider: new AnthropicAiProvider(client, model), sent };
}

describe("AnthropicAiProvider request", () => {
  it("sends structured output, adaptive thinking, a cached system prefix and the posting as the user turn", async () => {
    const { provider, sent } = setup(() => ({ body: messageBody() }));
    await provider.generateStructured(request);

    const { body } = first(sent);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.max_tokens).toBe(8000);
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.properties["verdict"]).toBeDefined();
    expect(body.system).toEqual([{ type: "text", text: "You score postings.", cache_control: { type: "ephemeral" } }]);
    expect(body.messages).toEqual([{ role: "user", content: "<posting>Backend dev</posting>" }]);
    expect(body.tool_choice).toBeUndefined();
  });

  it("opts into server-side fallbacks on models that support them", async () => {
    const { provider, sent } = setup(() => ({ body: messageBody() }));
    await provider.generateStructured(request);
    expect(first(sent).body.fallbacks).toBe("default");
    expect(first(sent).headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("does not send fallbacks to Haiku 5.5", async () => {
    const { provider, sent } = setup(() => ({ body: messageBody({ model: "claude-haiku-5-5" }) }), "claude-haiku-5-5");
    await provider.generateStructured(request);
    expect(first(sent).body.fallbacks).toBeUndefined();
    expect(first(sent).headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("refuses to start with a model that has no known price", () => {
    expect(() => new AnthropicAiProvider(new Anthropic({ apiKey: "k" }), "claude-mystery-1")).toThrow(AiNotConfiguredError);
  });
});

describe("AnthropicAiProvider response", () => {
  it("returns the parsed answer with usage and cost", async () => {
    const { provider } = setup(() => ({ body: messageBody() }));
    const result = await provider.generateStructured(request);
    expect(result.data).toEqual({ verdict: "fit" });
    expect(result.model).toBe("claude-sonnet-5-5");
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.004 });
  });

  it("prices cache reads and writes", async () => {
    const { provider } = setup(() => ({
      body: messageBody({}, { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 1000 }),
    }));
    const { usage } = await provider.generateStructured(request);
    expect(usage).toMatchObject({ cacheReadTokens: 5000, cacheWriteTokens: 1000, costUsd: 0.0047 });
  });

  it("bills every hop when a fallback model served the answer", async () => {
    const { provider } = setup(() => ({
      body: messageBody({ model: "claude-sonnet-5" }, {
        iterations: [
          { type: "message", model: "claude-sonnet-5-5", input_tokens: 500, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
          { type: "fallback_message", model: "claude-sonnet-5", input_tokens: 500, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
        ],
      }),
    }));
    const result = await provider.generateStructured(request);
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.usage).toMatchObject({ inputTokens: 1000, outputTokens: 110, costUsd: 0.0031 });
  });

  it("throws AiRefusalError with the category and the usage already spent", async () => {
    const { provider } = setup(() => ({
      body: messageBody({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } }),
    }));
    const error = await provider.generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiRefusalError);
    expect((error as AiRefusalError).category).toBe("cyber");
    expect((error as AiRefusalError).usage?.costUsd).toBe(0.004);
  });

  it("fails when the answer is cut off, is not JSON, or does not match the schema (usage preserved)", async () => {
    const cases = [
      messageBody({ stop_reason: "max_tokens" }),
      messageBody({ content: [{ type: "text", text: "sorry, no JSON" }] }),
      messageBody({ content: [{ type: "text", text: JSON.stringify({ verdict: "great" }) }] }),
    ];
    for (const body of cases) {
      const { provider } = setup(() => ({ body }));
      const error = await provider.generateStructured(request).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).usage?.costUsd).toBe(0.004);
    }
  });
});

describe("AnthropicAiProvider HTTP errors", () => {
  const apiError = (type: string) => ({ type: "error", error: { type, message: `${type} message` } });

  it("maps an invalid key to AiNotConfiguredError", async () => {
    const { provider } = setup(() => ({ status: 401, body: apiError("authentication_error") }));
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it.each([[429, "rate_limit_error"], [500, "api_error"], [400, "invalid_request_error"]])(
    "maps HTTP %i to AiProviderError",
    async (status, type) => {
      const { provider } = setup(() => ({ status, body: apiError(type) }));
      await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AiProviderError);
    },
  );
});
