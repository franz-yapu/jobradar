import { beforeEach, describe, expect, it } from "vitest";
import type { CandidateProfileData } from "../domain/candidate-profile.js";
import { ProfileNotFoundError } from "../domain/profile.repository.js";
import { InMemoryProfileRepository } from "../infrastructure/in-memory-profile.repository.js";
import { GetProfile } from "./get-profile.use-case.js";
import { SaveProfile } from "./save-profile.use-case.js";

const data: CandidateProfileData = {
  stack: ["TypeScript", "NestJS"],
  seniority: "senior",
  allowedLocations: ["BO", "latam"],
  maxEnglishLevel: "B2",
  excludedContractTypes: ["temporary"],
  summary: "Full stack developer",
  education: [{ institution: "UMSA", degree: "BSc", field: "Informatics", endYear: 2013 }],
  experience: [{ company: "Acme", role: "Backend", startYear: 2020, current: true, highlights: ["Built an API"] }],
  languages: [{ language: "English", level: "B1" }],
  certifications: ["AWS Cloud Practitioner"],
};

let repo: InMemoryProfileRepository;
let save: SaveProfile;
let get: GetProfile;

beforeEach(() => {
  repo = new InMemoryProfileRepository(() => new Date("2026-01-01T00:00:00Z"));
  save = new SaveProfile(repo);
  get = new GetProfile(repo);
});

describe("GetProfile", () => {
  it("throws ProfileNotFoundError when nothing was saved", async () => {
    await expect(get.execute()).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it("returns the saved profile", async () => {
    await save.execute(data);
    await expect(get.execute()).resolves.toMatchObject({ ...data, version: 1 });
  });
});

describe("SaveProfile", () => {
  it("creates the profile with version 1", async () => {
    const profile = await save.execute(data);
    expect(profile).toMatchObject({ version: 1, updatedAt: new Date("2026-01-01T00:00:00Z") });
  });

  it("replaces the profile and increments the version on every save", async () => {
    await save.execute(data);
    const second = await save.execute({ ...data, seniority: "lead", stack: ["Go"] });
    const third = await save.execute({ ...data, maxEnglishLevel: "C1" });
    expect(second).toMatchObject({ version: 2, seniority: "lead", stack: ["Go"] });
    expect(third).toMatchObject({ version: 3, maxEnglishLevel: "C1", stack: data.stack });
  });

  it("trims and de-duplicates stack, locations and contract types", async () => {
    const profile = await save.execute({
      ...data,
      stack: [" TypeScript ", "typescript", "NestJS", "  "],
      allowedLocations: ["BO", "BO", "latam"],
      excludedContractTypes: ["temporary", "temporary"],
      summary: "  hello  ",
    });
    expect(profile).toMatchObject({
      stack: ["TypeScript", "NestJS"],
      allowedLocations: ["BO", "latam"],
      excludedContractTypes: ["temporary"],
      summary: "hello",
    });
  });
});
