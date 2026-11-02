import { createPosting, type NewPosting, type Posting } from "../domain/posting.js";
import { normalizeUrl } from "../domain/normalize-url.js";
import { DuplicatePostingError, type PostingRepository } from "../domain/posting.repository.js";

export class CreatePosting {
  constructor(
    private readonly postings: PostingRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: NewPosting): Promise<Posting> {
    const url = normalizeUrl(input.url);
    if (await this.postings.findByUrl(url)) throw new DuplicatePostingError(url);

    const posting = createPosting({ ...input, url }, this.now());
    await this.postings.save(posting);
    return posting;
  }
}
