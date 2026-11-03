import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../../config/env.js";
import type { AiProvider } from "../domain/ai-provider.js";
import { AnthropicAiProvider } from "./anthropic-ai.provider.js";
import { GroqAiProvider } from "./groq-ai.provider.js";
import { UnconfiguredAiProvider } from "./unconfigured-ai.provider.js";

export function createAiProvider(
  env: Pick<Env, "AI_PROVIDER" | "AI_MODEL" | "ANTHROPIC_API_KEY" | "GROQ_API_KEY">,
): AiProvider {
  if (env.AI_PROVIDER === "groq") {
    if (!env.GROQ_API_KEY) return new UnconfiguredAiProvider(env.AI_MODEL, "GROQ_API_KEY");
    return new GroqAiProvider(env.GROQ_API_KEY, env.AI_MODEL);
  }
  if (!env.ANTHROPIC_API_KEY) return new UnconfiguredAiProvider(env.AI_MODEL);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return new AnthropicAiProvider(client, env.AI_MODEL);
}
