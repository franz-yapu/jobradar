import { z } from "zod";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { createAiProvider } from "../../src/ai/infrastructure/create-ai-provider.js";

/** Real API call that spends a few cents. Opt in with: pnpm --filter @jobradar/api test:live */
describe.skipIf(process.env["RUN_LIVE_AI"] !== "1")("live Anthropic call", () => {
  it("returns a schema-valid answer with tokens and cost", async () => {
    const provider = createAiProvider(loadEnv());
    const result = await provider.generateStructured({
      userId: "live",
      purpose: "scoring",
      system: "You answer with a short JSON object.",
      content: "Is 7 an odd number?",
      schema: z.object({ answer: z.boolean() }),
    });
    console.log(`model=${result.model}`, result.usage);
    expect(result.data.answer).toBe(true);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });
});
