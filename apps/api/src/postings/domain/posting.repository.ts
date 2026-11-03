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

export type VerdictFilter = "fit" | "maybe" | "reject" | "unscored";

/** Read-only view of the newest score of a posting (owned by the scoring module). */
export interface LatestScore {
  readonly verdict: "fit" | "maybe" | "reject";
  readonly reasons: readonly string[];
  readonly blockers: readonly { readonly type: string; readonly evidence: string }[];
  readonly scoredAt: Date;
}

/** A posting plus its newest score; `null` when it has not been scored. */
export type PostingListItem = Posting & { readonly latestScore: LatestScore | null };

export interface PostingFilter {
  source?: string | undefined;
  /** Matches the LATEST score of each posting; `unscored` matches postings without any score. */
  verdict?: VerdictFilter | undefined;
  /** Only postings with createdAt >= this instant. */
  createdSince?: Date | undefined;
  /** Case-insensitive match on title, company or description. */
  q?: string | undefined;
  page: number;
  pageSize: number;
}

export interface PostingPage {
  items: PostingListItem[];
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
