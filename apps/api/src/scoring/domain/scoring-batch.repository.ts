import type { ScoringBatch, ScoringBatchProgress, ScoringJob } from "./scoring-batch.js";

export const SCORING_BATCH_REPOSITORY = Symbol("SCORING_BATCH_REPOSITORY");

export class ScoringBatchNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Scoring batch ${id} not found`);
    this.name = "ScoringBatchNotFoundError";
  }
}

export class ScoringJobNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Scoring job ${id} not found`);
    this.name = "ScoringJobNotFoundError";
  }
}

export interface ScoringBatchRepository {
  /** Stores the batch and its jobs together (all `queued`). */
  create(batch: ScoringBatch, jobs: readonly ScoringJob[]): Promise<void>;
  /** Only the owner's batch; another account's behaves as if it did not exist. */
  findProgress(userId: string, batchId: string): Promise<ScoringBatchProgress | null>;
  findJob(jobId: string): Promise<ScoringJob | null>;
  /** Moves a job out of `queued`; returns false when it was no longer queued (someone else got there first). */
  finishJob(jobId: string, status: "done" | "failed", errorCode: string | null, at: Date): Promise<boolean>;
  /** Fails every still-queued job of the batch (no AI call is made for them). */
  failQueued(batchId: string, errorCode: string, at: Date): Promise<void>;
}
