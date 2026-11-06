import type { ScoringJob as JobRow } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { ScoringBatch, ScoringBatchProgress, ScoringJob } from "../domain/scoring-batch.js";
import type { ScoringBatchRepository } from "../domain/scoring-batch.repository.js";

function toJob(row: JobRow): ScoringJob {
  return row;
}

export class PrismaScoringBatchRepository implements ScoringBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(batch: ScoringBatch, jobs: readonly ScoringJob[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.scoringBatch.create({ data: batch }),
      this.prisma.scoringJob.createMany({ data: jobs.map((job) => ({ ...job })) }),
    ]);
  }

  async findProgress(userId: string, batchId: string): Promise<ScoringBatchProgress | null> {
    const row = await this.prisma.scoringBatch.findFirst({
      where: { id: batchId, userId },
      include: { jobs: { orderBy: { id: "asc" } } },
    });
    if (!row) return null;
    const { jobs, ...batch } = row;
    return { batch, jobs: jobs.map(toJob) };
  }

  async findJob(jobId: string): Promise<ScoringJob | null> {
    const row = await this.prisma.scoringJob.findUnique({ where: { id: jobId } });
    return row ? toJob(row) : null;
  }

  async finishJob(jobId: string, status: "done" | "failed", errorCode: string | null, at: Date): Promise<boolean> {
    // Conditional update: only one worker can move a job out of `queued`.
    const { count } = await this.prisma.scoringJob.updateMany({
      where: { id: jobId, status: "queued" },
      data: { status, errorCode, updatedAt: at },
    });
    return count === 1;
  }

  async failQueued(batchId: string, errorCode: string, at: Date): Promise<void> {
    await this.prisma.scoringJob.updateMany({
      where: { batchId, status: "queued" },
      data: { status: "failed", errorCode, updatedAt: at },
    });
  }
}
