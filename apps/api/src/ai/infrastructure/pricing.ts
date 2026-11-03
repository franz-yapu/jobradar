import type { AiUsage } from "../domain/ai-provider.js";

/** USD per million tokens. Source: Anthropic/Groq price lists as of PRICES_AS_OF; revisit when it changes. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache writes. */
  cacheWrite: number;
}

export const PRICES_AS_OF = "2026-10-06";

// Haiku 5.5 charges more for prompts above 100K tokens; our prompts are far below that.
const PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // Groq (trial provider). Their list prices, same date caveat; Groq has no cache-write charge.
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79, cacheRead: 0.59, cacheWrite: 0 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3, cacheRead: 0.0375, cacheWrite: 0 },
};

export function priceFor(model: string): ModelPrice | undefined {
  return PRICES[model];
}

/** The most expensive known rate per component: used when a fallback model is not in the table, so budgets err on the safe side. */
const CONSERVATIVE: ModelPrice = Object.values(PRICES).reduce((max, p) => ({
  input: Math.max(max.input, p.input),
  output: Math.max(max.output, p.output),
  cacheRead: Math.max(max.cacheRead, p.cacheRead),
  cacheWrite: Math.max(max.cacheWrite, p.cacheWrite),
}));

export type TokenCounts = Pick<AiUsage, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens">;

export function costUsd(model: string, tokens: TokenCounts): number {
  const p = priceFor(model) ?? CONSERVATIVE;
  return (
    (tokens.inputTokens * p.input +
      tokens.outputTokens * p.output +
      tokens.cacheReadTokens * p.cacheRead +
      tokens.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}
