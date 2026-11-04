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

describe("months in experience and education", () => {
  const job = { company: "Acme", role: "Dev", current: false, highlights: [] };
  const parse = (experience: unknown[]) => SaveProfileSchema.safeParse({ ...valid, experience });

  it("accepts a range with months and one without (older profiles)", () => {
    expect(parse([{ ...job, startYear: 2020, startMonth: 3, endYear: 2022, endMonth: 6 }]).success).toBe(true);
    expect(parse([{ ...job, startYear: 2020, endYear: 2022 }]).success).toBe(true);
  });

  it("rejects an end before the start, a month out of range, and a month without a year", () => {
    expect(parse([{ ...job, startYear: 2022, startMonth: 5, endYear: 2022, endMonth: 4 }]).success).toBe(false);
    expect(parse([{ ...job, startYear: 2022, endYear: 2020 }]).success).toBe(false);
    expect(parse([{ ...job, startYear: 2020, startMonth: 13 }]).success).toBe(false);
    expect(parse([{ ...job, startMonth: 5 }]).success).toBe(false);
  });

  it("allows the same month for start and end, and an open current job", () => {
    expect(parse([{ ...job, startYear: 2022, startMonth: 5, endYear: 2022, endMonth: 5 }]).success).toBe(true);
    expect(parse([{ ...job, current: true, startYear: 2023, startMonth: 1 }]).success).toBe(true);
  });

  it("applies the same rule to education", () => {
    const study = { institution: "UMSA", degree: "BSc" };
    const edu = (extra: object) => SaveProfileSchema.safeParse({ ...valid, education: [{ ...study, ...extra }] }).success;
    expect(edu({ startYear: 2010, startMonth: 3, endYear: 2015, endMonth: 12 })).toBe(true);
    expect(edu({ startYear: 2015, endYear: 2010 })).toBe(false);
  });
});
