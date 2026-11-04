import { describe, expect, it } from "vitest";
import { CreatePostingSchema, ListPostingsQuerySchema, PostingListItemSchema } from "./postings.js";

const valid = { title: "Backend Dev", company: "Acme", url: "https://acme.com/jobs/1", source: "manual" };

describe("CreatePostingSchema", () => {
  it("applies defaults for optional fields", () => {
    const parsed = CreatePostingSchema.parse(valid);
    expect(parsed.remoteScope).toBe("unknown");
    expect(parsed.description).toBe("");
    expect(parsed.location).toBeUndefined();
  });

  it("accepts a manual identity instead of a URL, and rejects a malformed one", () => {
    const hash = "0f".repeat(32);
    expect(CreatePostingSchema.safeParse({ ...valid, url: `manual:${hash}` }).success).toBe(true);
    expect(CreatePostingSchema.safeParse({ ...valid, url: "manual:abc" }).success).toBe(false);
    expect(CreatePostingSchema.safeParse({ ...valid, url: `manual:${hash.toUpperCase()}` }).success).toBe(false);
  });

  it("rejects non-http urls and empty titles", () => {
    expect(CreatePostingSchema.safeParse({ ...valid, url: "ftp://acme.com/x" }).success).toBe(false);
    expect(CreatePostingSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
  });

  it("rejects unknown remote scopes", () => {
    expect(CreatePostingSchema.safeParse({ ...valid, remoteScope: "mars" }).success).toBe(false);
  });
});

describe("ListPostingsQuerySchema", () => {
  it("defaults to page 1, pageSize 20", () => {
    expect(ListPostingsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces numeric strings and drops empty filters", () => {
    expect(ListPostingsQuerySchema.parse({ page: "2", pageSize: "50", q: "", source: " x " })).toEqual({
      page: 2,
      pageSize: 50,
      source: "x",
    });
  });

  it("caps pageSize at 100", () => {
    expect(ListPostingsQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});

describe("ListPostingsQuerySchema verdict and createdSince", () => {
  it("accepts the three verdicts, unscored and an ISO instant", () => {
    for (const verdict of ["fit", "maybe", "reject", "unscored"]) {
      expect(ListPostingsQuerySchema.parse({ verdict }).verdict).toBe(verdict);
    }
    expect(ListPostingsQuerySchema.parse({ createdSince: "2026-11-03T08:00:00Z" }).createdSince).toBe("2026-11-03T08:00:00Z");
  });

  it("rejects unknown verdicts and non-ISO dates", () => {
    expect(ListPostingsQuerySchema.safeParse({ verdict: "great" }).success).toBe(false);
    expect(ListPostingsQuerySchema.safeParse({ createdSince: "yesterday" }).success).toBe(false);
  });
});

describe("PostingListItemSchema", () => {
  const item = {
    id: "00000000-0000-4000-8000-000000000001", title: "t", company: "c", url: "https://x.test", source: "s",
    location: null, remoteScope: "unknown", description: "", publishedAt: null, createdAt: "2026-11-03T08:00:00Z",
  };
  it("allows a null or a full latestScore", () => {
    expect(PostingListItemSchema.safeParse({ ...item, latestScore: null }).success).toBe(true);
    expect(
      PostingListItemSchema.safeParse({
        ...item,
        latestScore: { verdict: "fit", reasons: ["ok"], blockers: [], scoredAt: "2026-11-03T08:05:00Z" },
      }).success,
    ).toBe(true);
  });
  it("requires the latestScore key", () => {
    expect(PostingListItemSchema.safeParse(item).success).toBe(false);
  });
});
