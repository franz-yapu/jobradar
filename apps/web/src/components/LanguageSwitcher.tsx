import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/language";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span>{t("language.label")}</span>
      <select
        className="rounded border border-slate-300 bg-white px-2 py-1"
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
