import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../../config/env.js";
import type { AiProvider } from "../domain/ai-provider.js";
import { AnthropicAiProvider } from "./anthropic-ai.provider.js";
import { UnconfiguredAiProvider } from "./unconfigured-ai.provider.js";

export function createAiProvider(env: Pick<Env, "ANTHROPIC_API_KEY" | "AI_MODEL">): AiProvider {
  if (!env.ANTHROPIC_API_KEY) return new UnconfiguredAiProvider(env.AI_MODEL);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return new AnthropicAiProvider(client, env.AI_MODEL);
}
