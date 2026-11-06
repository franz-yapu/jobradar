import {
  AiNotConfiguredError,
  AiProviderError,
  AiRefusalError,
  BudgetExceededError,
} from "../../ai/domain/ai-provider.js";
import { PostingNotFoundError } from "../../postings/domain/posting.repository.js";
import { ProfileNotFoundError } from "../../profile/domain/profile.repository.js";
import { ScoringJobNotFoundError, type ScoringBatchRepository } from "../domain/scoring-batch.repository.js";
import type { ScorePosting } from "./score-posting.use-case.js";

/** Machine code of a scoring failure, the same ones the synchronous endpoint answers with. */
export function scoringErrorCode(error: unknown): string {
  if (error instanceof BudgetExceededError) return "ai_budget_exceeded";
  if (error instanceof ProfileNotFoundError) return "profile_not_configured";
  if (error instanceof AiRefusalError) return "ai_refused";
  if (error instanceof AiNotConfiguredError) return "ai_not_configured";
  if (error instanceof AiProviderError) return "ai_provider_error";
  if (error instanceof PostingNotFoundError) return "posting_not_found";
  return "internal_error";
}

/**
 * Scores one queued job. Idempotent: a job that is no longer `queued` is skipped, so a redelivered
 * message never scores twice. Failures are recorded on the job (never thrown), so a queue does not retry them.
 * A budget or configuration stop fails the rest of the batch too, without more AI calls.
 */
export class ProcessScoringJob {
  constructor(
    private readonly batches: ScoringBatchRepository,
    private readonly scorePosting: ScorePosting,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(jobId: string): Promise<void> {
    const job = await this.batches.findJob(jobId);
    if (!job) throw new ScoringJobNotFoundError(jobId);
    if (job.status !== "queued") return;

    try {
      await this.scorePosting.execute(job.userId, job.postingId);
    } catch (error) {
      const code = scoringErrorCode(error);
      await this.batches.finishJob(job.id, "failed", code, this.now());
      if (code === "ai_budget_exceeded" || code === "ai_not_configured" || code === "profile_not_configured") {
        await this.batches.failQueued(job.batchId, code, this.now());
      }
      return;
    }
    await this.batches.finishJob(job.id, "done", null, this.now());
  }
}
