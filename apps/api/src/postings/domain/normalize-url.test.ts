import { describe, expect, it } from "vitest";
import { InvalidUrlError, normalizeUrl } from "./normalize-url.js";

describe("normalizeUrl", () => {
  it("lowercases the host and strips fragment and trailing slash", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Jobs/42/#apply")).toBe("https://example.com/Jobs/42");
  });

  it("removes tracking params but keeps meaningful ones", () => {
    expect(normalizeUrl("https://a.com/job?id=7&utm_source=rss&UTM_Medium=x&ref=tw&fbclid=1&gclid=2")).toBe(
      "https://a.com/job?id=7",
    );
  });

  it("normalizes a bare domain", () => {
    expect(normalizeUrl("https://a.com/")).toBe("https://a.com");
    expect(normalizeUrl("https://a.com/?utm_source=x")).toBe("https://a.com");
  });

  it("rejects invalid or non-http urls", () => {
    expect(() => normalizeUrl("not a url")).toThrow(InvalidUrlError);
    expect(() => normalizeUrl("ftp://a.com/x")).toThrow(InvalidUrlError);
  });

  it("keeps a manual identity (pasted text without a URL) as it is, lowercased", () => {
    const hash = "ab".repeat(32);
    expect(normalizeUrl(`  manual:${hash.toUpperCase()} `)).toBe(`manual:${hash}`);
  });

  it("rejects a malformed manual identity", () => {
    expect(() => normalizeUrl("manual:short")).toThrow(InvalidUrlError);
  });
});
