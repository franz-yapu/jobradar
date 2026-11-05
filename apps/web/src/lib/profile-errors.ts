import type { ProfileForm } from "./profile-form";

/** Field path → i18n key suffix under `profile.errors`. Paths look like `experience.0.role`. */
export type FieldErrors = Record<string, "required">;

/**
 * Rows the API would silently drop (one of the two required fields filled, the other blank) are flagged on the
 * missing field, so the user sees what is wrong before saving instead of losing the row.
 */
export function fieldErrors(form: ProfileForm): FieldErrors {
  const errors: FieldErrors = {};
  const blank = (value: string | undefined) => !value || !value.trim();
  const pair = (list: string, index: number, a: [string, string | undefined], b: [string, string | undefined], others: (string | undefined)[]) => {
    const anyFilled = !blank(a[1]) || !blank(b[1]) || others.some((value) => !blank(value));
    if (!anyFilled) return;
    if (blank(a[1])) errors[`${list}.${index}.${a[0]}`] = "required";
    if (blank(b[1])) errors[`${list}.${index}.${b[0]}`] = "required";
  };
  form.experience.forEach((item, index) => pair("experience", index, ["company", item.company], ["role", item.role], [item.highlights.join("")]));
  form.education.forEach((item, index) => pair("education", index, ["institution", item.institution], ["degree", item.degree], [item.field]));
  form.languages.forEach((item, index) => pair("languages", index, ["language", item.language], ["level", item.level], []));
  return errors;
}
