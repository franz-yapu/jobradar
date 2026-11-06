import type { ScoringBatchProgress } from "../domain/scoring-batch.js";
import { ScoringBatchNotFoundError, type ScoringBatchRepository } from "../domain/scoring-batch.repository.js";

export class GetScoringBatch {
  constructor(private readonly batches: ScoringBatchRepository) {}

  async execute(userId: string, batchId: string): Promise<ScoringBatchProgress> {
    const progress = await this.batches.findProgress(userId, batchId);
    if (!progress) throw new ScoringBatchNotFoundError(batchId);
    return progress;
  }
}
