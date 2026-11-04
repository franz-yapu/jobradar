import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import es from "./es.json";
import { detectLanguage, saveLanguage } from "./language";
import type { Language } from "./language";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createI18n(initial: Language) {
  const instance = i18n.createInstance();
  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, es: { translation: es } },
    lng: initial,
    fallbackLng: "en",
    interpolation: { escapeValue: false }, // React already escapes
    initAsync: false,
  });
  return instance;
}

/** App-wide instance: language from storage / browser; every change is saved and reflected on <html lang>. */
export function createAppI18n() {
  const storage = safeStorage();
  const instance = createI18n(detectLanguage(storage, navigator.language));
  const apply = (language: string) => {
    document.documentElement.lang = language;
  };
  apply(instance.language);
  instance.on("languageChanged", (language) => {
    apply(language);
    if (language === "en" || language === "es") saveLanguage(safeStorage(), language);
  });
  return instance;
}
