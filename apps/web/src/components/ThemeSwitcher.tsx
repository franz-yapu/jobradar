import { useTranslation } from "react-i18next";
import { THEME_CHOICES, type ThemeChoice } from "../theme/theme";
import { useTheme } from "../theme/ThemeProvider";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

const ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const;

/** Three-way switch: light, dark, or follow the system. A radio group, so the keyboard and screen readers get it for free. */
export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { choice, setChoice } = useTheme();

  return (
    <div role="radiogroup" aria-label={t("theme.label")} className="flex rounded-md border border-line-strong bg-card p-0.5">
      {THEME_CHOICES.map((option: ThemeChoice) => {
        const Icon = ICONS[option];
        const selected = choice === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`theme.${option}`)}
            title={t(`theme.${option}`)}
            className={`flex size-8 items-center justify-center rounded-[4px] transition-colors ${
              selected ? "bg-primary-soft text-primary-ink" : "text-muted hover:text-ink"
            }`}
            onClick={() => setChoice(option)}
          >
            <Icon width={16} height={16} />
          </button>
        );
      })}
    </div>
  );
}
