import type { PostingScore } from "../domain/posting-score.js";
import type { PostingScoreRepository } from "../domain/posting-score.repository.js";

export class InMemoryPostingScoreRepository implements PostingScoreRepository {
  readonly scores: PostingScore[] = [];

  async save(score: PostingScore): Promise<void> {
    this.scores.push(score);
  }

  async findLatest(postingId: string): Promise<PostingScore | null> {
    return (
      this.scores
        .filter((s) => s.postingId === postingId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }
}
