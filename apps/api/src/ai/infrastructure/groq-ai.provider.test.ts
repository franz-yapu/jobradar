import { z } from "zod";
import { describe, expect, it } from "vitest";
import { AiNotConfiguredError, AiProviderError, type GenerateStructuredRequest } from "../domain/ai-provider.js";
import { createAiProvider } from "./create-ai-provider.js";
import { GroqAiProvider } from "./groq-ai.provider.js";
import { UnconfiguredAiProvider } from "./unconfigured-ai.provider.js";

const schema = z.object({ verdict: z.enum(["fit", "maybe", "reject"]) });
const request: GenerateStructuredRequest<z.infer<typeof schema>> = {
  userId: "user-a", purpose: "scoring", system: "You score postings.", content: "<posting>Backend dev</posting>", schema,
};

function ok(content: string, extra: Record<string, unknown> = {}) {
  return {
    model: "llama-3.3-70b-versatile",
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 1000, completion_tokens: 100 },
    ...extra,
  };
}

function setup(respond: () => { status?: number; body: unknown } | Error, model = "llama-3.3-70b-versatile") {
  const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    sent.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const result = respond();
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
  };
  return { sent, provider: new GroqAiProvider("gsk_test", model, { fetch: fakeFetch }) };
}

describe("GroqAiProvider", () => {
  it("sends a JSON-mode request with the schema in the system prompt and the posting as the user message", async () => {
    const { provider, sent } = setup(() => ({ body: ok('{"verdict":"fit"}') }));
    await provider.generateStructured(request);
    const call = sent[0];
    expect(call?.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(call?.headers.get("authorization")).toBe("Bearer gsk_test");
    expect(call?.body).toMatchObject({
      model: "llama-3.3-70b-versatile", temperature: 0, response_format: { type: "json_object" },
    });
    const messages = call?.body["messages"] as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(messages[1]?.content).toBe(request.content);
    const system = messages[0]?.content ?? "";
    expect(system).toContain("You score postings.");
    expect(system).toContain('"verdict"');
  });

  it("asks gpt-oss models for low reasoning so a long answer is not eaten by thinking tokens", async () => {
    const oss = setup(() => ({ body: ok('{"verdict":"fit"}') }), "openai/gpt-oss-20b");
    await oss.provider.generateStructured(request);
    expect(oss.sent[0]?.body).toMatchObject({ reasoning_effort: "low", max_tokens: 8000 });
    const llama = setup(() => ({ body: ok('{"verdict":"fit"}') }));
    await llama.provider.generateStructured(request);
    expect(llama.sent[0]?.body).not.toHaveProperty("reasoning_effort");
  });

  it("returns validated data with usage and cost", async () => {
    const { provider } = setup(() => ({ body: ok('{"verdict":"maybe"}') }));
    const result = await provider.generateStructured(request);
    expect(result.data).toEqual({ verdict: "maybe" });
    expect(result.usage).toMatchObject({ inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0 });
    expect(result.usage.costUsd).toBeCloseTo((1000 * 0.59 + 100 * 0.79) / 1e6, 8);
  });

  it("separates cached prompt tokens", async () => {
    const { provider } = setup(() => ({
      body: ok('{"verdict":"fit"}', { usage: { prompt_tokens: 1000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 600 } } }),
    }), "openai/gpt-oss-20b");
    const { usage } = await provider.generateStructured(request);
    expect(usage).toMatchObject({ inputTokens: 400, cacheReadTokens: 600 });
  });

  it("retries once when the answer is invalid JSON or misses a key, billing both attempts", async () => {
    for (const first of ["not json", '{"verdict":"great"}', "{}"]) {
      const answers = [ok(first), ok('{"verdict":"fit"}')];
      const { provider, sent } = setup(() => ({ body: answers.shift() }));
      const result = await provider.generateStructured(request);
      expect(result.data).toEqual({ verdict: "fit" });
      expect(sent).toHaveLength(2);
      expect(result.usage).toMatchObject({ inputTokens: 2000, outputTokens: 200 });
      expect(result.usage.costUsd).toBeCloseTo(2 * (1000 * 0.59 + 100 * 0.79) / 1e6, 8);
    }
  });

  it("gives up after two bad answers with the usage of both attempts", async () => {
    const { provider, sent } = setup(() => ({ body: ok("{}") }));
    const error = await provider.generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).message).toContain("expected schema");
    expect((error as AiProviderError).usage).toMatchObject({ inputTokens: 2000, outputTokens: 200 });
    expect(sent).toHaveLength(2);
  });

  it("does not retry a truncated answer", async () => {
    const truncated = { ...ok('{"verdict":"fi'), choices: [{ finish_reason: "length", message: { content: '{"verdict":"fi' } }] };
    const { provider, sent } = setup(() => ({ body: truncated }));
    const error = await provider.generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).usage?.inputTokens).toBe(1000);
    expect(sent).toHaveLength(1);
  });

  it("maps HTTP and network failures to typed errors", async () => {
    const run = (r: { status?: number; body: unknown } | Error) => setup(() => r).provider.generateStructured(request).catch((e: unknown) => e);
    expect(await run({ status: 401, body: { error: { message: "bad key" } } })).toBeInstanceOf(AiNotConfiguredError);
    expect(await run({ status: 429, body: {} })).toMatchObject({ name: "AiProviderError", message: expect.stringContaining("rate limit") });
    expect(await run({ status: 500, body: {} })).toBeInstanceOf(AiProviderError);
    expect(await run(new TypeError("fetch failed"))).toBeInstanceOf(AiProviderError);
    const failing = setup(() => ({ status: 500, body: {} }));
    await failing.provider.generateStructured(request).catch(() => undefined);
    expect(failing.sent).toHaveLength(1);
  });

  it("refuses to start with a model that has no price", () => {
    expect(() => new GroqAiProvider("k", "unknown-model")).toThrow(AiNotConfiguredError);
  });
});

describe("createAiProvider", () => {
  const base = { ANTHROPIC_API_KEY: undefined, GROQ_API_KEY: undefined };
  it("builds the Groq provider when selected and keyed", () => {
    expect(createAiProvider({ ...base, AI_PROVIDER: "groq", AI_MODEL: "llama-3.3-70b-versatile", GROQ_API_KEY: "k" })).toBeInstanceOf(GroqAiProvider);
  });
  it("falls back to the unconfigured provider naming the right key", async () => {
    const groq = createAiProvider({ ...base, AI_PROVIDER: "groq", AI_MODEL: "m" });
    expect(groq).toBeInstanceOf(UnconfiguredAiProvider);
    await expect(groq.generateStructured(request)).rejects.toThrow("GROQ_API_KEY");
    const claude = createAiProvider({ ...base, AI_PROVIDER: "anthropic", AI_MODEL: "claude-sonnet-5-5", GROQ_API_KEY: "k" });
    await expect(claude.generateStructured(request)).rejects.toThrow("ANTHROPIC_API_KEY");
  });
});
