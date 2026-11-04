import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { ChevronsLeftIcon, CloseIcon, KeyIcon, ListIcon, LogoutIcon, MenuIcon, PlusIcon, RadarIcon, ShieldIcon, UserIcon } from "./icons";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

const COLLAPSED_KEY = "jobradar.sidebar.collapsed";

const LINKS = [
  { to: "/", key: "nav.postings", end: true, Icon: ListIcon },
  { to: "/postings/new", key: "nav.add", end: false, Icon: PlusIcon },
  { to: "/profile", key: "nav.profile", end: false, Icon: UserIcon },
  { to: "/settings/account", key: "nav.account", end: false, Icon: ShieldIcon },
  { to: "/settings/tokens", key: "nav.tokens", end: false, Icon: KeyIcon, adminOnly: true },
] as const;

/** Title of the current page for the breadcrumb. */
function titleKey(pathname: string): string {
  return LINKS.find((link) => link.to === pathname)?.key ?? "nav.postings";
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // blocked storage: the choice just lasts for this session
  }
}

/**
 * Admin-style shell: fixed left sidebar on large screens (collapsible to icons), a drawer on phones,
 * a top bar with the breadcrumb and the language switch, and the page content on a light grey canvas.
 */
export function Layout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      writeCollapsed(!current);
      return !current;
    });
  }

  const labelClass = collapsed ? "lg:sr-only" : "";

  return (
    <div className="app-backdrop min-h-screen text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-pop"
      >
        {t("layout.skip")}
      </a>

      {drawerOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      ) : null}

      <aside
        id="sidebar"
        aria-label={t("layout.sidebar")}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar transition-[transform,width] duration-200 lg:visible lg:translate-x-0 ${
          collapsed ? "lg:w-[76px]" : "lg:w-64"
        } ${drawerOpen ? "visible translate-x-0 shadow-pop" : "invisible -translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-on-primary shadow-sm">
              <RadarIcon />
            </span>
            <span translate="no" className={`text-lg font-semibold ${labelClass}`}>{t("app.name")}</span>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink lg:hidden"
            aria-label={t("layout.closeMenu")}
            onClick={() => setDrawerOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label={t("layout.main")}>
          {LINKS.filter((link) => !("adminOnly" in link) || user?.isAdmin).map(({ to, key, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? t(key) : undefined}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  collapsed ? "lg:justify-center" : ""
                } ${isActive ? "bg-primary-soft text-primary-ink shadow-[inset_3px_0_0_var(--primary)]" : "text-muted hover:translate-x-0.5 hover:bg-raised hover:text-ink"}`
              }
            >
              <Icon className="shrink-0" />
              <span className={labelClass}>{t(key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-line p-3 lg:block">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted hover:bg-raised hover:text-ink lg:justify-start"
            aria-pressed={collapsed}
            aria-label={collapsed ? t("layout.expand") : t("layout.collapse")}
            onClick={toggleCollapsed}
          >
            <ChevronsLeftIcon className={`shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
            <span className={labelClass}>{t("layout.collapse")}</span>
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-page/80 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-muted hover:bg-raised hover:text-ink lg:hidden"
            aria-label={t("layout.openMenu")}
            aria-controls="sidebar"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
          <nav aria-label={t("layout.breadcrumb")} className="min-w-0 flex-1 truncate text-sm text-muted max-sm:invisible">
            <span translate="no">{t("app.name")}</span>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span className="font-medium text-ink" aria-current="page">
              {t(titleKey(pathname))}
            </span>
          </nav>
          <ThemeSwitcher />
          <LanguageSwitcher />
          <div className="flex items-center gap-1 sm:gap-2 sm:border-l sm:border-line sm:pl-3">
            <span
              aria-hidden="true"
              className="hidden size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold uppercase text-on-primary sm:flex"
            >
              {user?.email.charAt(0)}
            </span>
            <span className="hidden max-w-40 truncate text-sm text-muted md:inline" title={user?.email}>
              {user?.email}
            </span>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink"
              onClick={() => void logout().then(() => navigate("/login", { replace: true }))}
            >
              <LogoutIcon width={16} height={16} />
              <span className="sr-only sm:not-sr-only">{t("auth.logout")}</span>
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
