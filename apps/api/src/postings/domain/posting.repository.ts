import type { Posting } from "./posting.js";

export const POSTING_REPOSITORY = Symbol("POSTING_REPOSITORY");

export class DuplicatePostingError extends Error {
  constructor(public readonly url: string) {
    super(`A posting with URL ${url} already exists`);
    this.name = "DuplicatePostingError";
  }
}

export class PostingNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Posting ${id} not found`);
    this.name = "PostingNotFoundError";
  }
}

export interface PostingFilter {
  source?: string | undefined;
  /** Case-insensitive match on title, company or description. */
  q?: string | undefined;
  page: number;
  pageSize: number;
}

export interface PostingPage {
  items: Posting[];
  total: number;
}

export interface PostingRepository {
  /** Throws DuplicatePostingError if the URL is already stored. */
  save(posting: Posting): Promise<void>;
  findByUrl(url: string): Promise<Posting | null>;
  findById(id: string): Promise<Posting | null>;
  /** Newest first (createdAt desc, id desc). */
  list(filter: PostingFilter): Promise<PostingPage>;
}
