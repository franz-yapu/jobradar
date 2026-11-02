import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryPostingRepository } from "../infrastructure/in-memory-posting.repository.js";
import { CreatePosting } from "./create-posting.use-case.js";
import { ListPostings } from "./list-postings.use-case.js";

let repo: InMemoryPostingRepository;
let list: ListPostings;

async function seed(n: number, overrides: Record<string, string> = {}): Promise<void> {
  let tick = 0;
  const create = new CreatePosting(repo, () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)));
  for (let i = 1; i <= n; i++) {
    await create.execute({
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
    const result = await list.execute({ page: 1, pageSize: 2 });
    expect(result.items.map((p) => p.title)).toEqual(["Job 5", "Job 4"]);
    expect(result).toMatchObject({ page: 1, pageSize: 2, total: 5 });
  });

  it("returns the requested page", async () => {
    await seed(5);
    const result = await list.execute({ page: 3, pageSize: 2 });
    expect(result.items.map((p) => p.title)).toEqual(["Job 1"]);
  });

  it("filters by source", async () => {
    await seed(2, { source: "getonboard", prefix: "g" });
    await seed(3, { source: "manual", prefix: "m" });
    const result = await list.execute({ source: "getonboard", page: 1, pageSize: 20 });
    expect(result.total).toBe(2);
  });

  it("searches title, company and description case-insensitively", async () => {
    await seed(2, { description: "We use NestJS", prefix: "a" });
    await seed(1, { prefix: "b" });
    expect((await list.execute({ q: "nestjs", page: 1, pageSize: 20 })).total).toBe(2);
    expect((await list.execute({ q: "ACME", page: 1, pageSize: 20 })).total).toBe(3);
    expect((await list.execute({ q: "cobol", page: 1, pageSize: 20 })).total).toBe(0);
  });
});
