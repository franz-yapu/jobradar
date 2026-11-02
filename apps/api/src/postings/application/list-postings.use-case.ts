import type { Posting } from "../domain/posting.js";
import type { PostingFilter, PostingRepository } from "../domain/posting.repository.js";

export interface ListPostingsResult {
  items: Posting[];
  page: number;
  pageSize: number;
  total: number;
}

export class ListPostings {
  constructor(private readonly postings: PostingRepository) {}

  async execute(filter: PostingFilter): Promise<ListPostingsResult> {
    const { items, total } = await this.postings.list(filter);
    return { items, page: filter.page, pageSize: filter.pageSize, total };
  }
}
