export const SCORING_JOB_STATUSES = ["queued", "done", "failed"] as const;
export type ScoringJobStatus = (typeof SCORING_JOB_STATUSES)[number];

/** One posting to score for one account, part of a batch. */
export interface ScoringJob {
  readonly id: string;
  readonly batchId: string;
  readonly userId: string;
  readonly postingId: string;
  readonly status: ScoringJobStatus;
  /** Machine code of the failure (`ai_budget_exceeded`, ...); null unless `failed`. */
  readonly errorCode: string | null;
  readonly updatedAt: Date;
}

export interface ScoringBatch {
  readonly id: string;
  readonly userId: string;
  readonly requested: number;
  readonly createdAt: Date;
}

export interface ScoringBatchProgress {
  readonly batch: ScoringBatch;
  readonly jobs: readonly ScoringJob[];
}

/** What travels through the queue: enough to find the job again, nothing more. */
export interface ScoringJobMessage {
  readonly jobId: string;
  readonly userId: string;
  readonly postingId: string;
}
