import { beforeEach, describe, expect, it } from "vitest";
import type { LatestScore } from "../domain/posting.repository.js";
import { InMemoryPostingRepository } from "../infrastructure/in-memory-posting.repository.js";
import { CreatePosting } from "./create-posting.use-case.js";
import { ListPostings } from "./list-postings.use-case.js";

const USER = "user-a";

let repo: InMemoryPostingRepository;
let list: ListPostings;

async function seed(n: number, overrides: Record<string, string> = {}): Promise<void> {
  let tick = 0;
  const create = new CreatePosting(repo, () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)));
  for (let i = 1; i <= n; i++) {
    await create.execute(USER, {
      title: `Job ${i}`,
      company: "Acme",
      url: `https://acme.com/jobs/${overrides["prefix"] ?? ""}${i}`,
      source: overrides["source"] ?? "manual",
      remoteScope: "unknown",
      description: overrides["description"] ?? "plain",
    });
  }
}

beforeEach(() => {
  repo = new InMemoryPostingRepository();
  list = new ListPostings(repo);
});

describe("ListPostings", () => {
  it("returns newest first with pagination metadata", async () => {
    await seed(5);
    const result = await list.execute(USER, { page: 1, pageSize: 2 });
    expect(result.items.map((p) => p.title)).toEqual(["Job 5", "Job 4"]);
    expect(result).toMatchObject({ page: 1, pageSize: 2, total: 5 });
  });

  it("returns the requested page", async () => {
    await seed(5);
    const result = await list.execute(USER, { page: 3, pageSize: 2 });
    expect(result.items.map((p) => p.title)).toEqual(["Job 1"]);
  });

  it("filters by source", async () => {
    await seed(2, { source: "getonboard", prefix: "g" });
    await seed(3, { source: "manual", prefix: "m" });
    const result = await list.execute(USER, { source: "getonboard", page: 1, pageSize: 20 });
    expect(result.total).toBe(2);
  });

  it("searches title, company and description case-insensitively", async () => {
    await seed(2, { description: "We use NestJS", prefix: "a" });
    await seed(1, { prefix: "b" });
    expect((await list.execute(USER, { q: "nestjs", page: 1, pageSize: 20 })).total).toBe(2);
    expect((await list.execute(USER, { q: "ACME", page: 1, pageSize: 20 })).total).toBe(3);
    expect((await list.execute(USER, { q: "cobol", page: 1, pageSize: 20 })).total).toBe(0);
  });
});

describe("ListPostings with scores", () => {
  const score = (verdict: LatestScore["verdict"], minute: number): LatestScore => ({
    verdict, reasons: [`r-${verdict}`], blockers: [], scoredAt: new Date(Date.UTC(2026, 0, 2, 0, minute)),
  });
  const titles = async (filter: Parameters<ListPostings["execute"]>[1]) =>
    (await list.execute(USER, filter)).items.map((p) => p.title);

  async function seedScored(): Promise<void> {
    await seed(4); // Job 1..4, created in that order
    const all = (await list.execute(USER, { page: 1, pageSize: 10 })).items;
    const id = (title: string) => all.find((p) => p.title === title)?.id ?? "";
    repo.attachScore(id("Job 1"), score("fit", 1));
    repo.attachScore(id("Job 2"), score("reject", 1));
    repo.attachScore(id("Job 3"), score("fit", 1));
    repo.attachScore(id("Job 3"), score("reject", 5)); // newest wins: Job 3 is a reject now
  }

  it("returns latestScore (or null) with every item", async () => {
    await seedScored();
    const items = (await list.execute(USER, { page: 1, pageSize: 10 })).items;
    expect(items.find((p) => p.title === "Job 1")?.latestScore).toMatchObject({ verdict: "fit", reasons: ["r-fit"] });
    expect(items.find((p) => p.title === "Job 4")?.latestScore).toBeNull();
  });

  it("filters on the LATEST score only", async () => {
    await seedScored();
    expect(await titles({ verdict: "fit", page: 1, pageSize: 10 })).toEqual(["Job 1"]);
    expect(await titles({ verdict: "reject", page: 1, pageSize: 10 })).toEqual(["Job 3", "Job 2"]);
    expect(await titles({ verdict: "maybe", page: 1, pageSize: 10 })).toEqual([]);
  });

  it("filters unscored postings", async () => {
    await seedScored();
    expect(await titles({ verdict: "unscored", page: 1, pageSize: 10 })).toEqual(["Job 4"]);
  });

  it("filters by createdSince (inclusive) and combines with other filters and paging", async () => {
    await seedScored();
    const since = new Date(Date.UTC(2026, 0, 1, 0, 0, 2)); // Job 3 and Job 4
    expect(await titles({ createdSince: since, page: 1, pageSize: 10 })).toEqual(["Job 4", "Job 3"]);
    expect(await titles({ createdSince: since, verdict: "reject", page: 1, pageSize: 10 })).toEqual(["Job 3"]);
    const paged = await list.execute(USER, { createdSince: since, page: 2, pageSize: 1 });
    expect(paged.items.map((p) => p.title)).toEqual(["Job 3"]);
    expect(paged.total).toBe(2);
  });
});

describe("ListPostings is scoped to the account", () => {
  it("never returns, counts or pages another account's postings", async () => {
    await seed(3);
    const create = new CreatePosting(repo);
    await create.execute("user-b", {
      title: "Private job of B", company: "Other", url: "https://other.com/1", source: "manual",
      remoteScope: "unknown", description: "secret",
    });

    const mine = await list.execute(USER, { page: 1, pageSize: 20 });
    expect(mine.total).toBe(3);
    expect(mine.items.map((p) => p.title)).not.toContain("Private job of B");

    const theirs = await list.execute("user-b", { page: 1, pageSize: 20 });
    expect(theirs.items.map((p) => p.title)).toEqual(["Private job of B"]);
    expect(theirs.total).toBe(1);

    // search and filters cannot reach across accounts either
    expect((await list.execute(USER, { q: "secret", page: 1, pageSize: 20 })).total).toBe(0);
    expect((await list.execute("nobody", { page: 1, pageSize: 20 })).total).toBe(0);
  });
});
