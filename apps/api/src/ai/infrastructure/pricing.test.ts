import { describe, expect, it } from "vitest";
import { costUsd, priceFor } from "./pricing.js";

const tokens = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };

describe("pricing", () => {
  it("prices every token kind per million", () => {
    expect(costUsd("claude-sonnet-5-5", tokens)).toBeCloseTo(2 + 10 + 0.2 + 2.5);
    expect(costUsd("claude-haiku-5-5", { ...tokens, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(0.6);
  });

  it("computes small realistic requests", () => {
    expect(costUsd("claude-sonnet-5-5", { inputTokens: 2500, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(0.008);
  });

  it("uses the most expensive known rate for unknown models so budgets err on the safe side", () => {
    expect(priceFor("claude-future-9")).toBeUndefined();
    expect(costUsd("claude-future-9", tokens)).toBeGreaterThanOrEqual(costUsd("claude-fable-5-1", tokens));
  });
});
