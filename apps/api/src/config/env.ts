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
  AI_MODEL: z.string().trim().min(1).default("claude-sonnet-5-5"),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(1),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
