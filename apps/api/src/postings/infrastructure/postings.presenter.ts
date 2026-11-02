import type { PostingResponse } from "@jobradar/shared";
import type { Posting } from "../domain/posting.js";

export function toPostingResponse(posting: Posting): PostingResponse {
  return {
    ...posting,
    publishedAt: posting.publishedAt?.toISOString() ?? null,
    createdAt: posting.createdAt.toISOString(),
  };
}
