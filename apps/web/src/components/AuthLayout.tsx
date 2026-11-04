import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RadarIcon } from "./icons";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

/** Centered card for the screens that need no account: login and registration. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col bg-page text-ink">
      <header className="flex flex-wrap justify-end gap-2 p-4">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-on-primary">
            <RadarIcon />
          </span>
          <span translate="no" className="text-xl font-semibold">{t("app.name")}</span>
        </div>
        <div className="rounded-lg border border-line bg-card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
