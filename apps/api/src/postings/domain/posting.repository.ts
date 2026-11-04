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
  /** Only your own postings, or only the catalog. Both when omitted. */
  scope?: "mine" | "catalog" | undefined;
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

/**
 * Every read is scoped to one account (ADR-0002): a private posting of another account behaves as if it did not exist.
 * Catalog postings (no owner, ADR-0004) are readable by every account.
 */
export interface PostingRepository {
  /** Throws DuplicatePostingError if THIS account (or, for a catalog posting, the catalog) already stored the URL. */
  save(posting: Posting): Promise<void>;
  /** `null` looks in the catalog. */
  findByUrl(userId: string | null, url: string): Promise<Posting | null>;
  /** A posting of this account or a catalog posting; anything else behaves as if it did not exist. */
  findById(userId: string, id: string): Promise<Posting | null>;
  /** The account's own postings plus the catalog, newest first (createdAt desc, id desc). Scores are the account's. */
  list(userId: string, filter: PostingFilter): Promise<PostingPage>;
}
