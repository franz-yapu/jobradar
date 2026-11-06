import type { ScoringBatch, ScoringBatchProgress, ScoringJob } from "../domain/scoring-batch.js";
import type { ScoringBatchRepository } from "../domain/scoring-batch.repository.js";

export class InMemoryScoringBatchRepository implements ScoringBatchRepository {
  private readonly batches = new Map<string, ScoringBatch>();
  private readonly jobs = new Map<string, ScoringJob>();

  async create(batch: ScoringBatch, jobs: readonly ScoringJob[]): Promise<void> {
    this.batches.set(batch.id, batch);
    for (const job of jobs) this.jobs.set(job.id, job);
  }

  async findProgress(userId: string, batchId: string): Promise<ScoringBatchProgress | null> {
    const batch = this.batches.get(batchId);
    if (!batch || batch.userId !== userId) return null;
    return { batch, jobs: [...this.jobs.values()].filter((job) => job.batchId === batchId) };
  }

  async findJob(jobId: string): Promise<ScoringJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async finishJob(jobId: string, status: "done" | "failed", errorCode: string | null, at: Date): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "queued") return false;
    this.jobs.set(jobId, { ...job, status, errorCode, updatedAt: at });
    return true;
  }

  async failQueued(batchId: string, errorCode: string, at: Date): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.batchId === batchId && job.status === "queued") {
        this.jobs.set(job.id, { ...job, status: "failed", errorCode, updatedAt: at });
      }
    }
  }
}
