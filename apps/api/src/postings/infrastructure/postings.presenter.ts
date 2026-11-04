import type { PostingListItemResponse, PostingResponse } from "@jobradar/shared";
import { postingScope, type Posting } from "../domain/posting.js";
import type { PostingListItem } from "../domain/posting.repository.js";

/** The owner is internal: it is never part of the API response. */
export function toPostingResponse(posting: Posting): PostingResponse {
  const { userId: _userId, ...visible } = posting;
  return {
    ...visible,
    publishedAt: posting.publishedAt?.toISOString() ?? null,
    createdAt: posting.createdAt.toISOString(),
    scope: postingScope(posting),
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
