import { describe, expect, it } from "vitest";
import { CreatePostingSchema, ListPostingsQuerySchema } from "./postings.js";

const valid = { title: "Backend Dev", company: "Acme", url: "https://acme.com/jobs/1", source: "manual" };

describe("CreatePostingSchema", () => {
  it("applies defaults for optional fields", () => {
    const parsed = CreatePostingSchema.parse(valid);
    expect(parsed.remoteScope).toBe("unknown");
    expect(parsed.description).toBe("");
    expect(parsed.location).toBeUndefined();
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
