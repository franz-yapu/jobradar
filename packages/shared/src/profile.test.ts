import { describe, expect, it } from "vitest";
import { SaveProfileSchema } from "./profile.js";

const valid = {
  stack: ["TypeScript", "NestJS"],
  seniority: "senior",
  allowedLocations: ["BO", "latam"],
  maxEnglishLevel: "B2",
};

describe("SaveProfileSchema", () => {
  it("applies defaults for excluded contracts and summary", () => {
    const parsed = SaveProfileSchema.parse(valid);
    expect(parsed.excludedContractTypes).toEqual([]);
    expect(parsed.summary).toBe("");
  });

  it("rejects an empty stack or empty locations", () => {
    expect(SaveProfileSchema.safeParse({ ...valid, stack: [] }).success).toBe(false);
    expect(SaveProfileSchema.safeParse({ ...valid, allowedLocations: [] }).success).toBe(false);
  });

  it("accepts only country codes, latam and worldwide as locations", () => {
    for (const ok of ["BO", "AR", "latam", "worldwide"]) {
      expect(SaveProfileSchema.safeParse({ ...valid, allowedLocations: [ok] }).success).toBe(true);
    }
    for (const bad of ["bo", "BOL", "Europe", ""]) {
      expect(SaveProfileSchema.safeParse({ ...valid, allowedLocations: [bad] }).success).toBe(false);
    }
  });

  it("rejects unknown seniority, english level and contract types", () => {
    expect(SaveProfileSchema.safeParse({ ...valid, seniority: "god" }).success).toBe(false);
    expect(SaveProfileSchema.safeParse({ ...valid, maxEnglishLevel: "D1" }).success).toBe(false);
    expect(SaveProfileSchema.safeParse({ ...valid, excludedContractTypes: ["slave"] }).success).toBe(false);
  });
});
