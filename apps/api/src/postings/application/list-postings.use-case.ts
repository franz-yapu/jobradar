import type { PostingFilter, PostingListItem, PostingRepository } from "../domain/posting.repository.js";

export interface ListPostingsResult {
  items: PostingListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export class ListPostings {
  constructor(private readonly postings: PostingRepository) {}

  async execute(userId: string, filter: PostingFilter): Promise<ListPostingsResult> {
    const { items, total } = await this.postings.list(userId, filter);
    return { items, page: filter.page, pageSize: filter.pageSize, total };
  }
}
