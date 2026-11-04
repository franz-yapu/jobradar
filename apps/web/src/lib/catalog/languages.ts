import type { Option } from "./search";

/** Spoken languages people list on a CV (ISO 639-1). Names come from the browser in the active language. */
const CODES = "en es pt fr de it nl sv da no fi is pl cs sk hu ro bg el tr ru uk sr hr sl lt lv et he ar fa hi bn ur ta te th vi id ms tl zh ja ko sw af ca eu gl cy ga qu ay gn";

function names(language: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([language], { type: "language" });
  } catch {
    return null;
  }
}

/**
 * The stored value is the language's English name ("Spanish"), which is what the CV import and the scoring
 * prompt already use; the label is its name in the active language ("Español"), sorted alphabetically.
 */
export function languageNameOptions(language: string): Option[] {
  const english = names("en");
  const local = names(language);
  return CODES.split(" ")
    .map((code) => {
      const value = english?.of(code) ?? code;
      const label = local?.of(code) ?? value;
      return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, language));
}
