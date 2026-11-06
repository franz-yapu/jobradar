import type { ScoringJobMessage } from "./scoring-batch.js";

export const SCORING_QUEUE = Symbol("SCORING_QUEUE");

/**
 * Hand-off of batch scoring work to a worker. Delivery is at least once: the consumer must tolerate
 * receiving the same job twice (ProcessScoringJob does).
 */
export interface ScoringQueue {
  enqueue(jobs: readonly ScoringJobMessage[]): Promise<void>;
}
