import { describe, expect, it } from "vitest";
import { DuplicatePostingError } from "../domain/posting.repository.js";
import { InMemoryPostingRepository } from "../infrastructure/in-memory-posting.repository.js";
import { postingScope } from "../domain/posting.js";
import { CreatePosting, NotAdminError } from "./create-posting.use-case.js";

const USER = "user-a";
const account = (id: string, isAdmin = false) => ({ id, isAdmin });

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
    const posting = await new CreatePosting(repo, () => now).execute(account(USER), input);

    expect(posting).toMatchObject({ ...input, userId: USER, location: null, publishedAt: null, createdAt: now });
    expect(posting.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repo.findByUrl(USER, input.url)).resolves.toEqual(posting);
  });

  it("stores the normalized url", async () => {
    const repo = new InMemoryPostingRepository();
    const posting = await new CreatePosting(repo).execute(account(USER), { ...input, url: "https://Acme.com/jobs/1/?utm_source=rss#x" });
    expect(posting.url).toBe("https://acme.com/jobs/1");
  });

  it("rejects a duplicate url", async () => {
    const useCase = new CreatePosting(new InMemoryPostingRepository());
    await useCase.execute(account(USER), input);
    await expect(useCase.execute(account(USER), input)).rejects.toBeInstanceOf(DuplicatePostingError);
  });

  it("rejects a duplicate that only differs by tracking params", async () => {
    const useCase = new CreatePosting(new InMemoryPostingRepository());
    await useCase.execute(account(USER), input);
    await expect(useCase.execute(account(USER), { ...input, url: `${input.url}/?utm_campaign=x&ref=tw` })).rejects.toBeInstanceOf(
      DuplicatePostingError,
    );
  });

  it("lets two accounts keep the same url, each in its own list", async () => {
    const repo = new InMemoryPostingRepository();
    const create = new CreatePosting(repo);
    const mine = await create.execute(account(USER), input);
    const theirs = await create.execute(account("user-b"), input);

    expect(mine.id).not.toBe(theirs.id);
    expect(theirs.userId).toBe("user-b");
    await expect(repo.findByUrl("user-b", input.url)).resolves.toEqual(theirs);
    await expect(create.execute(account("user-b"), input)).rejects.toBeInstanceOf(DuplicatePostingError);
  });

  it("does not see another account's posting by url or id", async () => {
    const repo = new InMemoryPostingRepository();
    const mine = await new CreatePosting(repo).execute(account(USER), input);
    await expect(repo.findByUrl("user-b", input.url)).resolves.toBeNull();
    await expect(repo.findById("user-b", mine.id)).resolves.toBeNull();
    await expect(repo.findById(USER, mine.id)).resolves.toEqual(mine);
  });

  describe("shared catalog (ADR-0004)", () => {
    it("lets an administrator store a catalog posting with no owner, deduplicated by url across the catalog", async () => {
      const repo = new InMemoryPostingRepository();
      const create = new CreatePosting(repo);
      const posting = await create.execute(account("boss", true), input, "catalog");
      expect(posting.userId).toBeNull();
      expect(postingScope(posting)).toBe("catalog");
      await expect(repo.findByUrl(null, input.url)).resolves.toEqual(posting);
      await expect(create.execute(account("boss", true), { ...input, url: `${input.url}/?utm_source=x` }, "catalog")).rejects.toBeInstanceOf(
        DuplicatePostingError,
      );
    });

    it("refuses a non-administrator and stores nothing", async () => {
      const repo = new InMemoryPostingRepository();
      await expect(new CreatePosting(repo).execute(account(USER), input, "catalog")).rejects.toBeInstanceOf(NotAdminError);
      await expect(repo.findByUrl(null, input.url)).resolves.toBeNull();
    });

    it("an administrator's default is still a private posting", async () => {
      const posting = await new CreatePosting(new InMemoryPostingRepository()).execute(account("boss", true), input);
      expect(posting.userId).toBe("boss");
    });

    it("a private posting and a catalog posting may share a url", async () => {
      const create = new CreatePosting(new InMemoryPostingRepository());
      await create.execute(account("boss", true), input, "catalog");
      await expect(create.execute(account(USER), input)).resolves.toMatchObject({ userId: USER });
    });

    it("every account can read a catalog posting by id, but not another account's private one", async () => {
      const repo = new InMemoryPostingRepository();
      const create = new CreatePosting(repo);
      const shared = await create.execute(account("boss", true), input, "catalog");
      const secret = await create.execute(account("user-b"), { ...input, url: "https://acme.com/jobs/2" });
      await expect(repo.findById(USER, shared.id)).resolves.toEqual(shared);
      await expect(repo.findById(USER, secret.id)).resolves.toBeNull();
    });
  });
});
