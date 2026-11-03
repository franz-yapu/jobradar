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
import { ScoringController } from "./scoring.controller.js";

@Module({
  imports: [PostingsModule, ProfileModule, AiModule],
  controllers: [ScoringController],
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
      provide: GetPostingScore,
      useFactory: (p: PostingRepository, s: PostingScoreRepository) => new GetPostingScore(p, s),
      inject: [POSTING_REPOSITORY, POSTING_SCORE_REPOSITORY],
    },
  ],
})
export class ScoringModule {}
