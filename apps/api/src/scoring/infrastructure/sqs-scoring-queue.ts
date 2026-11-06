import { SendMessageBatchCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { ScoringJobMessage } from "../domain/scoring-batch.js";
import type { ScoringQueue } from "../domain/scoring-queue.js";

/** SQS accepts at most 10 entries per SendMessageBatch. */
const SQS_BATCH_LIMIT = 10;

/**
 * Durable queue: one message per job, body = JSON of the message. The worker (Lambda) reads them and calls
 * the API back; it never touches the database. Redelivery is harmless because ProcessScoringJob is idempotent.
 */
export class SqsScoringQueue implements ScoringQueue {
  constructor(
    private readonly client: Pick<SQSClient, "send">,
    private readonly queueUrl: string,
  ) {}

  async enqueue(jobs: readonly ScoringJobMessage[]): Promise<void> {
    for (let i = 0; i < jobs.length; i += SQS_BATCH_LIMIT) {
      const chunk = jobs.slice(i, i + SQS_BATCH_LIMIT);
      const result = await this.client.send(
        new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: chunk.map((job) => ({ Id: job.jobId, MessageBody: JSON.stringify(job) })),
        }),
      );
      if (result.Failed && result.Failed.length > 0) {
        const ids = result.Failed.map((f) => f.Id).join(", ");
        throw new Error(`SQS rejected ${result.Failed.length} scoring job(s): ${ids}`);
      }
    }
  }
}
