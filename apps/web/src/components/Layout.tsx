import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { LanguageSwitcher } from "./LanguageSwitcher";

const LINKS = [
  { to: "/", key: "nav.postings", end: true },
  { to: "/postings/new", key: "nav.add", end: false },
  { to: "/profile", key: "nav.profile", end: false },
] as const;

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">{t("app.name")}</h1>
            <p className="text-xs text-slate-500">{t("app.tagline")}</p>
          </div>
          <nav className="flex gap-4 text-sm" aria-label="Main">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? "font-semibold text-slate-900" : "text-slate-600 hover:text-slate-900")}
              >
                {t(link.key)}
              </NavLink>
            ))}
          </nav>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
