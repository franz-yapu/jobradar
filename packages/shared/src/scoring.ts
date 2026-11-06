import { z } from "zod";

export const VERDICTS = ["fit", "maybe", "reject"] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

export const BLOCKER_TYPES = ["location", "english", "seniority", "contract", "stack", "other"] as const;
export const BlockerTypeSchema = z.enum(BLOCKER_TYPES);
export type BlockerType = z.infer<typeof BlockerTypeSchema>;

export const BlockerSchema = z.object({
  type: BlockerTypeSchema,
  /** Quote or paraphrase from the posting that justifies the blocker. */
  evidence: z.string(),
});
export type BlockerResponse = z.infer<typeof BlockerSchema>;

export const PostingScoreSchema = z.object({
  id: z.uuid(),
  postingId: z.uuid(),
  verdict: VerdictSchema,
  reasons: z.array(z.string()),
  blockers: z.array(BlockerSchema),
  profileVersion: z.number().int().min(1),
  promptVersion: z.string(),
  model: z.string(),
  aiCallId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PostingScoreResponse = z.infer<typeof PostingScoreSchema>;

export const MAX_BATCH_SIZE = 10;

export const StartScoringBatchSchema = z.object({
  limit: z.number().int().min(1).max(MAX_BATCH_SIZE).default(MAX_BATCH_SIZE),
});
export type StartScoringBatchRequest = z.input<typeof StartScoringBatchSchema>;

export const ScoringBatchStartedSchema = z.object({
  /** Null when there was nothing left to score (`requested` is 0). */
  id: z.uuid().nullable(),
  requested: z.number().int().min(0),
});
export type ScoringBatchStartedResponse = z.infer<typeof ScoringBatchStartedSchema>;

export const ScoringBatchSchema = z.object({
  id: z.uuid(),
  requested: z.number().int().min(1),
  queued: z.number().int().min(0),
  done: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** One entry per failed posting, with the machine code (`ai_budget_exceeded`, ...). */
  errors: z.array(z.object({ postingId: z.uuid(), code: z.string() })),
  createdAt: z.iso.datetime({ offset: true }),
});
export type ScoringBatchResponse = z.infer<typeof ScoringBatchSchema>;
