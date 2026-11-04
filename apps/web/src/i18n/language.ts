export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "jobradar.language";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Saved choice first, then the browser language, then English. Storage may be unavailable. */
export function detectLanguage(storage: Pick<Storage, "getItem"> | null, browserLanguage: string | undefined): Language {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // blocked storage: fall through to the browser language
  }
  return browserLanguage?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function saveLanguage(storage: Pick<Storage, "setItem"> | null, language: Language): void {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // blocked storage: the choice just lasts for this session
  }
}
