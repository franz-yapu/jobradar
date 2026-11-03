import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Optional: the API boots without it and AI endpoints answer 503. */
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  /** Optional, only used when AI_PROVIDER=groq (cheap trials). */
  GROQ_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  AI_PROVIDER: z.enum(["anthropic", "groq"]).default("anthropic"),
  /** Defaults to the provider's recommended model. */
  AI_MODEL: z.string().trim().optional(),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(1),
});

const DEFAULT_MODELS = { anthropic: "claude-sonnet-5-5", groq: "llama-3.3-70b-versatile" } as const;

export type Env = Omit<z.infer<typeof EnvSchema>, "AI_MODEL"> & { AI_MODEL: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(source);
  return { ...env, AI_MODEL: env.AI_MODEL || DEFAULT_MODELS[env.AI_PROVIDER] };
}
