import { describe, expect, it } from "vitest";
import { CvDraftSchema, SaveProfileSchema } from "./profile.js";

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

describe("profile background fields", () => {
  it("default to empty lists so existing clients keep working", () => {
    const parsed = SaveProfileSchema.parse(valid);
    expect(parsed).toMatchObject({ education: [], experience: [], languages: [], certifications: [] });
  });

  it("accepts education, experience, languages and certifications", () => {
    const parsed = SaveProfileSchema.parse({
      ...valid,
      education: [{ institution: "UMSA", degree: "BSc", field: "Informatics", startYear: 2008, endYear: 2013 }],
      experience: [{ company: "Acme", role: "Backend", startYear: 2020, current: true, highlights: ["Built an API"] }],
      languages: [{ language: "English", level: "B1" }],
      certifications: ["AWS Cloud Practitioner"],
    });
    expect(parsed.experience[0]).toMatchObject({ current: true, highlights: ["Built an API"] });
  });

  it("bounds the lists and the years", () => {
    const tooMany = Array.from({ length: 16 }, () => ({ company: "A", role: "B" }));
    expect(SaveProfileSchema.safeParse({ ...valid, experience: tooMany }).success).toBe(false);
    expect(SaveProfileSchema.safeParse({ ...valid, education: [{ institution: "X", degree: "Y", endYear: 1800 }] }).success).toBe(false);
    expect(SaveProfileSchema.safeParse({ ...valid, certifications: Array(21).fill("c") }).success).toBe(false);
  });
});

describe("CvDraftSchema", () => {
  it("is a profile plus warning codes, and warnings default to none", () => {
    expect(CvDraftSchema.parse(valid).warnings).toEqual([]);
    expect(CvDraftSchema.parse({ ...valid, warnings: ["location_missing"] }).warnings).toEqual(["location_missing"]);
    expect(CvDraftSchema.safeParse({ ...valid, warnings: ["made up"] }).success).toBe(false);
  });

  it("allows an incomplete draft that the profile itself would refuse", () => {
    const incomplete = { ...valid, stack: [], allowedLocations: [] };
    expect(CvDraftSchema.safeParse(incomplete).success).toBe(true);
    expect(SaveProfileSchema.safeParse(incomplete).success).toBe(false);
  });
});
