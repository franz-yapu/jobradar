import { Module } from "@nestjs/common";
import { AI_PROVIDER, type AiProvider } from "../../ai/domain/ai-provider.js";
import { AiModule } from "../../ai/infrastructure/ai.module.js";
import { POSTING_REPOSITORY, type PostingRepository } from "../../postings/domain/posting.repository.js";
import { PostingsModule } from "../../postings/infrastructure/postings.module.js";
import { PROFILE_REPOSITORY, type ProfileRepository } from "../../profile/domain/profile.repository.js";
import { ProfileModule } from "../../profile/infrastructure/profile.module.js";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { GetPostingScore } from "../application/get-posting-score.use-case.js";
import { ScorePosting } from "../application/score-posting.use-case.js";
import { POSTING_SCORE_REPOSITORY, type PostingScoreRepository } from "../domain/posting-score.repository.js";
import { PrismaPostingScoreRepository } from "./prisma-posting-score.repository.js";
import { GetScoringBatch } from "../application/get-scoring-batch.use-case.js";
import { ProcessScoringJob } from "../application/process-scoring-job.use-case.js";
import { StartScoringBatch } from "../application/start-scoring-batch.use-case.js";
import { SCORING_BATCH_REPOSITORY, type ScoringBatchRepository } from "../domain/scoring-batch.repository.js";
import { SCORING_QUEUE, type ScoringQueue } from "../domain/scoring-queue.js";
import { SQSClient } from "@aws-sdk/client-sqs";
import { loadEnv } from "../../config/env.js";
import { InternalScoringController } from "./internal-scoring.controller.js";
import { SqsScoringQueue } from "./sqs-scoring-queue.js";
import { WORKER_SECRET, WorkerSignatureGuard } from "./worker-signature.guard.js";
import { InProcessScoringQueue } from "./in-process-scoring-queue.js";
import { PrismaScoringBatchRepository } from "./prisma-scoring-batch.repository.js";
import { ScoringBatchesController } from "./scoring-batches.controller.js";
import { ScoringController } from "./scoring.controller.js";

@Module({
  imports: [PostingsModule, ProfileModule, AiModule],
  controllers: [ScoringController, ScoringBatchesController, InternalScoringController],
  providers: [
    {
      provide: POSTING_SCORE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaPostingScoreRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ScorePosting,
      useFactory: (p: PostingRepository, pr: ProfileRepository, s: PostingScoreRepository, ai: AiProvider) =>
        new ScorePosting(p, pr, s, ai),
      inject: [POSTING_REPOSITORY, PROFILE_REPOSITORY, POSTING_SCORE_REPOSITORY, AI_PROVIDER],
    },
    {
      provide: SCORING_BATCH_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaScoringBatchRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ProcessScoringJob,
      useFactory: (b: ScoringBatchRepository, score: ScorePosting) => new ProcessScoringJob(b, score),
      inject: [SCORING_BATCH_REPOSITORY, ScorePosting],
    },
    {
      // In-process by default; SQS when SQS_QUEUE_URL is set (the worker then calls back the internal endpoint).
      provide: SCORING_QUEUE,
      useFactory: (process: ProcessScoringJob): ScoringQueue => {
        const { SQS } = loadEnv();
        if (!SQS) return new InProcessScoringQueue((jobId) => process.execute(jobId));
        const client = new SQSClient({ region: SQS.region, ...(SQS.endpoint !== undefined && { endpoint: SQS.endpoint }) });
        return new SqsScoringQueue(client, SQS.queueUrl);
      },
      inject: [ProcessScoringJob],
    },
    { provide: WORKER_SECRET, useFactory: () => loadEnv().WORKER_SECRET },
    WorkerSignatureGuard,
    {
      provide: StartScoringBatch,
      useFactory: (p: PostingRepository, pr: ProfileRepository, b: ScoringBatchRepository, q: ScoringQueue) =>
        new StartScoringBatch(p, pr, b, q),
      inject: [POSTING_REPOSITORY, PROFILE_REPOSITORY, SCORING_BATCH_REPOSITORY, SCORING_QUEUE],
    },
    {
      provide: GetScoringBatch,
      useFactory: (b: ScoringBatchRepository) => new GetScoringBatch(b),
      inject: [SCORING_BATCH_REPOSITORY],
    },
    {
      provide: GetPostingScore,
      useFactory: (p: PostingRepository, s: PostingScoreRepository) => new GetPostingScore(p, s),
      inject: [POSTING_REPOSITORY, POSTING_SCORE_REPOSITORY],
    },
  ],
})
export class ScoringModule {}
