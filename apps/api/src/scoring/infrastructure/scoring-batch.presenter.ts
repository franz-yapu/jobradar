import type { ScoringBatchResponse } from "@jobradar/shared";
import type { ScoringBatchProgress } from "../domain/scoring-batch.js";

export function toScoringBatchResponse({ batch, jobs }: ScoringBatchProgress): ScoringBatchResponse {
  return {
    id: batch.id,
    requested: batch.requested,
    queued: jobs.filter((job) => job.status === "queued").length,
    done: jobs.filter((job) => job.status === "done").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    errors: jobs.flatMap((job) => (job.status === "failed" ? [{ postingId: job.postingId, code: job.errorCode ?? "internal_error" }] : [])),
    createdAt: batch.createdAt.toISOString(),
  };
}
