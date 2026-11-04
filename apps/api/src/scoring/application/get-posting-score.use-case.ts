import { PostingNotFoundError, type PostingRepository } from "../../postings/domain/posting.repository.js";
import type { PostingScore } from "../domain/posting-score.js";
import { ScoreNotFoundError, type PostingScoreRepository } from "../domain/posting-score.repository.js";

export class GetPostingScore {
  constructor(
    private readonly postings: PostingRepository,
    private readonly scores: PostingScoreRepository,
  ) {}

  async execute(userId: string, postingId: string): Promise<PostingScore> {
    if (!(await this.postings.findById(userId, postingId))) throw new PostingNotFoundError(postingId);
    const score = await this.scores.findLatest(userId, postingId);
    if (!score) throw new ScoreNotFoundError(postingId);
    return score;
  }
}
