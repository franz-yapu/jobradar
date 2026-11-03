import { z } from "zod";

export const AiUsageSchema = z.object({
  /** UTC day, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spentUsd: z.number().min(0),
  budgetUsd: z.number().min(0),
  calls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
});
export type AiUsageResponse = z.infer<typeof AiUsageSchema>;
