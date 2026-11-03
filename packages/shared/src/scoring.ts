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
