import { describe, expect, it } from "vitest";
import { DuplicatePostingError } from "../domain/posting.repository.js";
import { InMemoryPostingRepository } from "../infrastructure/in-memory-posting.repository.js";
import { CreatePosting } from "./create-posting.use-case.js";

const USER = "user-a";

const input = {
  title: "Backend Dev",
  company: "Acme",
  url: "https://acme.com/jobs/1",
  source: "manual",
  remoteScope: "latam" as const,
  description: "NestJS",
};

describe("CreatePosting", () => {
  it("stores a new posting with defaults for optional fields", async () => {
    const repo = new InMemoryPostingRepository();
    const now = new Date("2026-01-01T00:00:00Z");
    const posting = await new CreatePosting(repo, () => now).execute(USER, input);

    expect(posting).toMatchObject({ ...input, userId: USER, location: null, publishedAt: null, createdAt: now });
    expect(posting.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repo.findByUrl(USER, input.url)).resolves.toEqual(posting);
  });

  it("stores the normalized url", async () => {
    const repo = new InMemoryPostingRepository();
    const posting = await new CreatePosting(repo).execute(USER, { ...input, url: "https://Acme.com/jobs/1/?utm_source=rss#x" });
    expect(posting.url).toBe("https://acme.com/jobs/1");
  });

  it("rejects a duplicate url", async () => {
    const useCase = new CreatePosting(new InMemoryPostingRepository());
    await useCase.execute(USER, input);
    await expect(useCase.execute(USER, input)).rejects.toBeInstanceOf(DuplicatePostingError);
  });

  it("rejects a duplicate that only differs by tracking params", async () => {
    const useCase = new CreatePosting(new InMemoryPostingRepository());
    await useCase.execute(USER, input);
    await expect(useCase.execute(USER, { ...input, url: `${input.url}/?utm_campaign=x&ref=tw` })).rejects.toBeInstanceOf(
      DuplicatePostingError,
    );
  });

  it("lets two accounts keep the same url, each in its own list", async () => {
    const repo = new InMemoryPostingRepository();
    const create = new CreatePosting(repo);
    const mine = await create.execute(USER, input);
    const theirs = await create.execute("user-b", input);

    expect(mine.id).not.toBe(theirs.id);
    expect(theirs.userId).toBe("user-b");
    await expect(repo.findByUrl("user-b", input.url)).resolves.toEqual(theirs);
    await expect(create.execute("user-b", input)).rejects.toBeInstanceOf(DuplicatePostingError);
  });

  it("does not see another account's posting by url or id", async () => {
    const repo = new InMemoryPostingRepository();
    const mine = await new CreatePosting(repo).execute(USER, input);
    await expect(repo.findByUrl("user-b", input.url)).resolves.toBeNull();
    await expect(repo.findById("user-b", mine.id)).resolves.toBeNull();
    await expect(repo.findById(USER, mine.id)).resolves.toEqual(mine);
  });
});
