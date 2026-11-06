import { Logger } from "@nestjs/common";
import type { ScoringJobMessage } from "../domain/scoring-batch.js";
import type { ScoringQueue } from "../domain/scoring-queue.js";

/**
 * Default queue: runs the jobs in this process, one at a time, after `enqueue` returns.
 * Needs no AWS, so `docker compose up` works as before. Jobs still queued when the process stops are lost
 * (they stay `queued`); the SQS adapter is the durable one.
 */
export class InProcessScoringQueue implements ScoringQueue {
  private readonly logger = new Logger(InProcessScoringQueue.name);
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly process: (jobId: string) => Promise<void>) {}

  async enqueue(jobs: readonly ScoringJobMessage[]): Promise<void> {
    for (const job of jobs) {
      this.tail = this.tail.then(() =>
        this.process(job.jobId).catch((error: unknown) => {
          this.logger.error(`Scoring job ${job.jobId} crashed: ${error instanceof Error ? error.message : String(error)}`);
        }),
      );
    }
  }

  /** Resolves when everything enqueued so far has been processed (tests and graceful shutdown). */
  idle(): Promise<void> {
    return this.tail;
  }
}
