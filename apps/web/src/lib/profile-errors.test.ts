import { describe, expect, it } from "vitest";
import { fieldErrors } from "./profile-errors";
import { EMPTY_FORM } from "./profile-form";

describe("fieldErrors", () => {
  it("flags the missing half of a half-filled row and ignores empty or complete rows", () => {
    const form = {
      ...EMPTY_FORM,
      experience: [
        { company: "Acme", role: "", current: false, highlights: [] },
        { company: "", role: "", current: false, highlights: [] },
        { company: "Beta", role: "Dev", current: false, highlights: [] },
      ],
      education: [{ institution: "", degree: "", field: "Math" }],
      languages: [{ language: "es", level: "" }],
    };
    expect(fieldErrors(form)).toEqual({
      "experience.0.role": "required",
      "education.0.institution": "required",
      "education.0.degree": "required",
      "languages.0.level": "required",
    });
  });
});
