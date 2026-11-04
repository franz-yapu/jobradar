import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/language";
import { GlobeIcon } from "./icons";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center gap-2 rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm text-ink focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      <GlobeIcon width={16} height={16} className="text-muted" />
      <span className="sr-only">{t("language.label")}</span>
      <select
        className="cursor-pointer bg-transparent pr-1 font-medium focus:outline-none"
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
