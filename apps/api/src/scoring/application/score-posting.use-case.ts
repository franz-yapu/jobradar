import { randomUUID } from "node:crypto";
import type { AiProvider } from "../../ai/domain/ai-provider.js";
import { PostingNotFoundError, type PostingRepository } from "../../postings/domain/posting.repository.js";
import { ProfileNotFoundError, type ProfileRepository } from "../../profile/domain/profile.repository.js";
import { enforceVerdictInvariant, type PostingScore } from "../domain/posting-score.js";
import type { PostingScoreRepository } from "../domain/posting-score.repository.js";
import {
  SCORING_PROMPT_VERSION,
  ScoringOutputSchema,
  buildScoringContent,
  buildScoringSystem,
} from "./score-posting.prompt.js";

/**
 * Scores a posting against the candidate profile. Each call adds a score (history is kept).
 * Propagates PostingNotFoundError, ProfileNotFoundError and the AI errors (refusal, budget, provider).
 */
export class ScorePosting {
  constructor(
    private readonly postings: PostingRepository,
    private readonly profiles: ProfileRepository,
    private readonly scores: PostingScoreRepository,
    private readonly ai: AiProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, postingId: string): Promise<PostingScore> {
    const posting = await this.postings.findById(userId, postingId);
    if (!posting) throw new PostingNotFoundError(postingId);
    const profile = await this.profiles.get(userId);
    if (!profile) throw new ProfileNotFoundError();

    const result = await this.ai.generateStructured({
      userId,
      purpose: "scoring",
      system: buildScoringSystem(profile),
      content: buildScoringContent(posting),
      schema: ScoringOutputSchema,
    });

    const score: PostingScore = {
      id: randomUUID(),
      userId,
      postingId: posting.id,
      verdict: enforceVerdictInvariant(result.data.verdict, result.data.blockers),
      reasons: result.data.reasons,
      blockers: result.data.blockers,
      profileVersion: profile.version,
      promptVersion: SCORING_PROMPT_VERSION,
      model: result.model,
      aiCallId: result.callId ?? null,
      createdAt: this.now(),
    };
    await this.scores.save(score);
    return score;
  }
}
