import type { PostingScoreResponse } from "@jobradar/shared";
import type { PostingScore } from "../domain/posting-score.js";

export function toPostingScoreResponse(score: PostingScore): PostingScoreResponse {
  const { userId: _userId, ...visible } = score;
  return {
    ...visible,
    reasons: [...score.reasons],
    blockers: score.blockers.map((b) => ({ ...b })),
    createdAt: score.createdAt.toISOString(),
  };
}
