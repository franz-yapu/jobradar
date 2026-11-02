import { describe, expect, it } from "vitest";
import { DuplicatePostingError } from "../domain/posting.repository.js";
import { InMemoryPostingRepository } from "../infrastructure/in-memory-posting.repository.js";
import { CreatePosting } from "./create-posting.use-case.js";

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
    const posting = await new CreatePosting(repo, () => now).execute(input);

    expect(posting).toMatchObject({ ...input, location: null, publishedAt: null, createdAt: now });
    expect(posting.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repo.findByUrl(input.url)).resolves.toEqual(posting);
  });

  it("stores the normalized url", async () => {
    const repo = new InMemoryPostingRepository();
    const posting = await new CreatePosting(repo).execute({ ...input, url: "https://Acme.com/jobs/1/?utm_source=rss#x" });
    expect(posting.url).toBe("https://acme.com/jobs/1");
  });

  it("rejects a duplicate url", async () => {
    const useCase = new CreatePosting(new InMemoryPostingRepository());
    await useCase.execute(input);
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(DuplicatePostingError);
  });

  it("rejects a duplicate that only differs by tracking params", async () => {
    const useCase = new CreatePosting(new InMemoryPostingRepository());
    await useCase.execute(input);
    await expect(useCase.execute({ ...input, url: `${input.url}/?utm_campaign=x&ref=tw` })).rejects.toBeInstanceOf(
      DuplicatePostingError,
    );
  });
});
