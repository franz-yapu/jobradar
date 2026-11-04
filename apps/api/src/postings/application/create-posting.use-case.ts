import { createPosting, type NewPosting, type Posting } from "../domain/posting.js";
import { normalizeUrl } from "../domain/normalize-url.js";
import { DuplicatePostingError, type PostingRepository } from "../domain/posting.repository.js";

/** Writing to the shared catalog is reserved to administrators (ADR-0004). */
export class NotAdminError extends Error {
  constructor() {
    super("Only an administrator can write to the shared catalog");
    this.name = "NotAdminError";
  }
}

export class CreatePosting {
  constructor(
    private readonly postings: PostingRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    user: { id: string; isAdmin: boolean },
    input: NewPosting,
    scope: "mine" | "catalog" = "mine",
  ): Promise<Posting> {
    if (scope === "catalog" && !user.isAdmin) throw new NotAdminError();
    const owner = scope === "catalog" ? null : user.id;
    const url = normalizeUrl(input.url);
    if (await this.postings.findByUrl(owner, url)) throw new DuplicatePostingError(url);

    const posting = createPosting(owner, { ...input, url }, this.now());
    await this.postings.save(posting);
    return posting;
  }
}
