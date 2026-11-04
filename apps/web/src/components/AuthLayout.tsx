import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BoltIcon, RadarIcon, SendIcon, ShieldIcon, TargetIcon } from "./icons";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

const FEATURES = [
  { Icon: BoltIcon, key: "auth.brand.f1" },
  { Icon: TargetIcon, key: "auth.brand.f2" },
  { Icon: SendIcon, key: "auth.brand.f3" },
] as const;

/** Split screen for the screens that need no account: a brand panel with a slow radar, and the form. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen bg-page text-ink lg:grid-cols-[1.05fr_1fr]">
      <aside className="brand-panel relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="blob -left-20 -top-24 size-96 bg-[#4fa376]/40" />
        <div className="blob -bottom-24 right-0 size-96 bg-[#2f8f8a]/35 [animation-delay:-6s]" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[-8rem] top-1/2 size-[34rem] -translate-y-1/2">
          <span className="radar-ring inset-0" />
          <span className="radar-ring inset-0 [animation-delay:-2s]" />
          <span className="radar-ring inset-0 [animation-delay:-4s]" />
          <span className="absolute inset-[18%] rounded-full border border-white/10" />
          <span className="absolute inset-[36%] rounded-full border border-white/10" />
          <span className="sweep absolute inset-0 rounded-full [background:conic-gradient(from_0deg,rgb(255_255_255/0.16),transparent_28%)]" />
        </div>

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <RadarIcon />
          </span>
          <span translate="no" className="text-xl font-semibold">{t("app.name")}</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="rise text-4xl font-semibold leading-tight tracking-tight text-balance">{t("auth.brand.headline")}</h2>
          <p className="rise mt-4 text-base leading-7 text-white/80 [animation-delay:80ms]">{t("auth.brand.text")}</p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(({ Icon, key }, index) => (
              <li
                key={key}
                className="rise flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/15 backdrop-blur-sm"
                style={{ animationDelay: `${160 + index * 90}ms` }}
              >
                <Icon width={18} height={18} className="shrink-0 text-[#a9e0bf]" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-sm text-white/70">
          <ShieldIcon width={16} height={16} />
          {t("auth.brand.footer")}
        </p>
      </aside>

      <div className="app-backdrop flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-2 p-4 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary">
              <RadarIcon />
            </span>
            <span translate="no" className="text-lg font-semibold">{t("app.name")}</span>
          </div>
          <div className="flex gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-0">
          <div className="rise rounded-2xl border border-line bg-card/90 p-6 shadow-pop backdrop-blur sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mb-7 mt-2 text-sm text-muted">{subtitle}</p>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
