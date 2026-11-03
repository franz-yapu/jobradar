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
  private readonly store = new Map<string, Posting>();
  private readonly scores = new Map<string, LatestScore>();

  async save(posting: Posting): Promise<void> {
    if (this.store.has(posting.url)) throw new DuplicatePostingError(posting.url);
    this.store.set(posting.url, posting);
  }

  /** Test helper: records a score; the newest `scoredAt` wins, like the real latest-score lookup. */
  attachScore(postingId: string, score: LatestScore): void {
    const current = this.scores.get(postingId);
    if (!current || score.scoredAt.getTime() >= current.scoredAt.getTime()) this.scores.set(postingId, score);
  }

  async findByUrl(url: string): Promise<Posting | null> {
    return this.store.get(url) ?? null;
  }

  async findById(id: string): Promise<Posting | null> {
    return [...this.store.values()].find((p) => p.id === id) ?? null;
  }

  async list(filter: PostingFilter): Promise<PostingPage> {
    const q = filter.q?.toLowerCase();
    const matches = [...this.store.values()]
      .filter((p) => (filter.source === undefined ? true : p.source === filter.source))
      .filter((p) => (filter.createdSince === undefined ? true : p.createdAt >= filter.createdSince))
      .filter((p) => matchesVerdict(this.scores.get(p.id), filter.verdict))
      .filter((p) =>
        q === undefined
          ? true
          : [p.title, p.company, p.description].some((field) => field.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    const start = (filter.page - 1) * filter.pageSize;
    const items: PostingListItem[] = matches
      .slice(start, start + filter.pageSize)
      .map((p) => ({ ...p, latestScore: this.scores.get(p.id) ?? null }));
    return { items, total: matches.length };
  }
}

function matchesVerdict(score: LatestScore | undefined, verdict: PostingFilter["verdict"]): boolean {
  if (verdict === undefined) return true;
  return verdict === "unscored" ? score === undefined : score?.verdict === verdict;
}
