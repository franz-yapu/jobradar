import type { PostingListItemResponse, PostingResponse } from "@jobradar/shared";
import type { Posting } from "../domain/posting.js";
import type { PostingListItem } from "../domain/posting.repository.js";

export function toPostingResponse(posting: Posting): PostingResponse {
  return {
    ...posting,
    publishedAt: posting.publishedAt?.toISOString() ?? null,
    createdAt: posting.createdAt.toISOString(),
  };
}

export function toPostingListItemResponse(item: PostingListItem): PostingListItemResponse {
  const { latestScore, ...posting } = item;
  return {
    ...toPostingResponse(posting),
    latestScore: latestScore && {
      verdict: latestScore.verdict,
      reasons: [...latestScore.reasons],
      blockers: latestScore.blockers.map((b) => ({ ...b })),
      scoredAt: latestScore.scoredAt.toISOString(),
    },
  };
}
