import type { PostingScore } from "./posting-score.js";

export const POSTING_SCORE_REPOSITORY = Symbol("POSTING_SCORE_REPOSITORY");

export class ScoreNotFoundError extends Error {
  constructor(public readonly postingId: string) {
    super(`Posting ${postingId} has not been scored yet`);
    this.name = "ScoreNotFoundError";
  }
}

export interface PostingScoreRepository {
  save(score: PostingScore): Promise<void>;
  /** Most recent score of the posting, or null. */
  findLatest(postingId: string): Promise<PostingScore | null>;
}
