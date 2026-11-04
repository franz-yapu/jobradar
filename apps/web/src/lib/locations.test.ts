import { describe, expect, it } from "vitest";
import { normalizeLocation } from "./locations";

describe("normalizeLocation", () => {
  it("uppercases country codes and lowercases the region keywords", () => {
    expect(normalizeLocation(" bo ")).toBe("BO");
    expect(normalizeLocation("LatAm")).toBe("latam");
    expect(normalizeLocation("WORLDWIDE")).toBe("worldwide");
  });

  it("rejects anything else", () => {
    expect(normalizeLocation("bolivia")).toBeNull();
    expect(normalizeLocation("B")).toBeNull();
    expect(normalizeLocation("12")).toBeNull();
  });
});
