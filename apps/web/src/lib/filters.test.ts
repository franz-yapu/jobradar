import { describe, expect, it } from "vitest";
import { parseFilters, serializeFilters, sinceToCreatedSince } from "./filters";

describe("filters <-> URL", () => {
  it("defaults when the URL is empty", () => {
    expect(parseFilters(new URLSearchParams())).toEqual({ verdict: undefined, q: "", source: "", since: "all", page: 1 });
  });

  it("round-trips every filter and keeps the default URL clean", () => {
    const filters = { verdict: "unscored", q: "node", source: "manual", since: "7d", page: 3 } as const;
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    expect(serializeFilters(parseFilters(new URLSearchParams())).toString()).toBe("");
  });

  it("ignores unknown or malformed values", () => {
    const parsed = parseFilters(new URLSearchParams("verdict=maybe-not&since=1y&page=-4"));
    expect(parsed).toMatchObject({ verdict: undefined, since: "all", page: 1 });
    expect(parseFilters(new URLSearchParams("page=abc")).page).toBe(1);
  });

  it("converts the relative window to an ISO instant", () => {
    const now = new Date("2026-11-04T12:00:00.000Z");
    expect(sinceToCreatedSince("24h", now)).toBe("2026-11-03T12:00:00.000Z");
    expect(sinceToCreatedSince("7d", now)).toBe("2026-10-28T12:00:00.000Z");
    expect(sinceToCreatedSince("all", now)).toBeUndefined();
  });
});
