import { randomUUID } from "node:crypto";
import type { PostingRepository } from "../../postings/domain/posting.repository.js";
import { ProfileNotFoundError, type ProfileRepository } from "../../profile/domain/profile.repository.js";
import type { ScoringBatch, ScoringJob } from "../domain/scoring-batch.js";
import type { ScoringBatchRepository } from "../domain/scoring-batch.repository.js";
import type { ScoringQueue } from "../domain/scoring-queue.js";

export interface StartedBatch {
  /** Null when there is nothing left to score. */
  readonly id: string | null;
  readonly requested: number;
}

/**
 * Takes the account's newest unscored postings (own + catalog) and queues them for scoring.
 * Throws ProfileNotFoundError (no profile, no point in spending AI calls).
 */
export class StartScoringBatch {
  constructor(
    private readonly postings: PostingRepository,
    private readonly profiles: ProfileRepository,
    private readonly batches: ScoringBatchRepository,
    private readonly queue: ScoringQueue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, limit: number): Promise<StartedBatch> {
    if (!(await this.profiles.get(userId))) throw new ProfileNotFoundError();

    const { items } = await this.postings.list(userId, { verdict: "unscored", page: 1, pageSize: limit });
    if (items.length === 0) return { id: null, requested: 0 };

    const at = this.now();
    const batch: ScoringBatch = { id: randomUUID(), userId, requested: items.length, createdAt: at };
    const jobs: ScoringJob[] = items.map((posting) => ({
      id: randomUUID(),
      batchId: batch.id,
      userId,
      postingId: posting.id,
      status: "queued",
      errorCode: null,
      updatedAt: at,
    }));
    await this.batches.create(batch, jobs);
    await this.queue.enqueue(jobs.map((job) => ({ jobId: job.id, userId, postingId: job.postingId })));
    return { id: batch.id, requested: batch.requested };
  }
}
