import { SaveProfileSchema } from "@jobradar/shared";
import { describe, expect, it } from "vitest";
import { EMPTY_FORM, toSaveBody } from "./profile-form";
import type { ProfileForm } from "./profile-form";

const base: ProfileForm = { ...EMPTY_FORM, stack: ["TypeScript"], allowedLocations: ["BO"] };

describe("toSaveBody", () => {
  it("drops rows the user left blank", () => {
    const body = toSaveBody({
      ...base,
      education: [{ institution: "", degree: "BSc" }, { institution: "UMSA", degree: "BSc" }],
      experience: [{ company: "Acme", role: "", current: false, highlights: [] }],
      languages: [{ language: "English", level: "" }, { language: "Spanish", level: "native" }],
    });
    expect(body.education).toHaveLength(1);
    expect(body.experience).toEqual([]);
    expect(body.languages).toEqual([{ language: "Spanish", level: "native" }]);
  });

  it("clears the end year of a current job and trims highlights", () => {
    const body = toSaveBody({
      ...base,
      experience: [{ company: "Acme", role: "Dev", current: true, endYear: 2024, highlights: [" Built an API ", "", "  "] }],
    });
    expect(body.experience?.[0]).toMatchObject({ current: true, endYear: undefined, highlights: ["Built an API"] });
  });

  it("produces a body the profile schema accepts", () => {
    const body = toSaveBody({
      ...base,
      education: [{ institution: "UMSA", degree: "BSc", field: "  ", startYear: 2008 }],
      experience: [{ company: "Acme", role: "Dev", startYear: 2020, current: true, highlights: ["x"] }],
    });
    expect(SaveProfileSchema.safeParse(body).success).toBe(true);
    expect(body.education?.[0]?.field).toBeUndefined();
  });
});
