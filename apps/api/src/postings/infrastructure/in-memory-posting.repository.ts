import type { Posting } from "../domain/posting.js";
import {
  DuplicatePostingError,
  type LatestScore,
  type PostingFilter,
  type PostingListItem,
  type PostingPage,
  type PostingRepository,
} from "../domain/posting.repository.js";

export class InMemoryPostingRepository implements PostingRepository {
  /** Keyed by `userId|url` (`catalog|url` for catalog postings): the same URL may exist once per account. */
  private readonly store = new Map<string, Posting>();
  /** Keyed by `userId|postingId`: scores belong to the account that asked for them. */
  private readonly scores = new Map<string, LatestScore>();

  async save(posting: Posting): Promise<void> {
    const key = `${posting.userId ?? "catalog"}|${posting.url}`;
    if (this.store.has(key)) throw new DuplicatePostingError(posting.url);
    this.store.set(key, posting);
  }

  /** Test helper: records a score; the newest `scoredAt` wins, like the real latest-score lookup. */
  attachScore(postingId: string, score: LatestScore, scoredBy?: string): void {
    const owner = scoredBy ?? [...this.store.values()].find((p) => p.id === postingId)?.userId;
    if (!owner) throw new Error("attachScore needs the account that scored a catalog posting");
    const key = `${owner}|${postingId}`;
    const current = this.scores.get(key);
    if (!current || score.scoredAt.getTime() >= current.scoredAt.getTime()) this.scores.set(key, score);
  }

  async findByUrl(userId: string | null, url: string): Promise<Posting | null> {
    return this.store.get(`${userId ?? "catalog"}|${url}`) ?? null;
  }

  async findById(userId: string, id: string): Promise<Posting | null> {
    return [...this.store.values()].find((p) => (p.userId === userId || p.userId === null) && p.id === id) ?? null;
  }

  async list(userId: string, filter: PostingFilter): Promise<PostingPage> {
    const q = filter.q?.toLowerCase();
    const matches = [...this.store.values()]
      .filter((p) => (filter.scope === "mine" ? p.userId === userId : filter.scope === "catalog" ? p.userId === null : p.userId === userId || p.userId === null))
      .filter((p) => (filter.source === undefined ? true : p.source === filter.source))
      .filter((p) => (filter.createdSince === undefined ? true : p.createdAt >= filter.createdSince))
      .filter((p) => matchesVerdict(this.scores.get(`${userId}|${p.id}`), filter.verdict))
      .filter((p) =>
        q === undefined
          ? true
          : [p.title, p.company, p.description].some((field) => field.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    const start = (filter.page - 1) * filter.pageSize;
    const items: PostingListItem[] = matches
      .slice(start, start + filter.pageSize)
      .map((p) => ({ ...p, latestScore: this.scores.get(`${userId}|${p.id}`) ?? null }));
    return { items, total: matches.length };
  }
}

function matchesVerdict(score: LatestScore | undefined, verdict: PostingFilter["verdict"]): boolean {
  if (verdict === undefined) return true;
  return verdict === "unscored" ? score === undefined : score?.verdict === verdict;
}
