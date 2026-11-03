import type { Posting } from "../domain/posting.js";
import {
  DuplicatePostingError,
  type PostingFilter,
  type PostingPage,
  type PostingRepository,
} from "../domain/posting.repository.js";

export class InMemoryPostingRepository implements PostingRepository {
  private readonly store = new Map<string, Posting>();

  async save(posting: Posting): Promise<void> {
    if (this.store.has(posting.url)) throw new DuplicatePostingError(posting.url);
    this.store.set(posting.url, posting);
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
      .filter((p) =>
        q === undefined
          ? true
          : [p.title, p.company, p.description].some((field) => field.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

    const start = (filter.page - 1) * filter.pageSize;
    return { items: matches.slice(start, start + filter.pageSize), total: matches.length };
  }
}
