import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/language";
import { CheckIcon, ChevronDownIcon, GlobeIcon } from "./icons";

/** Language menu: a button that opens a small listbox. Arrow keys, Home/End, Enter and Escape work. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? "en";
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    list.current?.focus();
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function choose(language: string) {
    void i18n.changeLanguage(language);
    setOpen(false);
    button.current?.focus();
  }

  function openMenu() {
    setActive(Math.max(0, LANGUAGES.findIndex((language) => language === current)));
    setOpen(true);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const last = LANGUAGES.length - 1;
    if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown") setActive((index) => Math.min(last, index + 1));
    else if (event.key === "ArrowUp") setActive((index) => Math.max(0, index - 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(last);
    else if (event.key === "Enter" || event.key === " ") {
      const language = LANGUAGES[active];
      if (language) choose(language);
    } else if (event.key === "Tab") setOpen(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.label")}
        className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-card px-2.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:bg-raised"
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <GlobeIcon width={16} height={16} className="text-primary-ink" />
        <span translate="no" className="hidden sm:inline">{t(`language.${current}`)}</span>
        <span translate="no" className="text-xs uppercase text-muted sm:hidden">{current}</span>
        <ChevronDownIcon width={14} height={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-label={t("language.label")}
          aria-activedescendant={`lang-${LANGUAGES[active]}`}
          onKeyDown={onKeyDown}
          className="pop absolute right-0 z-50 mt-2 w-48 rounded-xl border border-line-strong bg-card p-1.5 shadow-pop focus:outline-none"
        >
          {LANGUAGES.map((language, index) => {
            const selected = language === current;
            return (
              <li
                key={language}
                id={`lang-${language}`}
                role="option"
                aria-selected={selected}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${
                  index === active ? "bg-raised" : ""
                } ${selected ? "font-semibold text-primary-ink" : "text-ink"}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(language)}
              >
                <span
                  translate="no"
                  className={`flex size-7 items-center justify-center rounded-md text-[11px] font-bold uppercase ${
                    selected ? "bg-primary text-on-primary" : "bg-primary-soft text-primary-ink"
                  }`}
                >
                  {language}
                </span>
                <span translate="no" className="flex-1">{t(`language.${language}`)}</span>
                {selected ? <CheckIcon width={16} height={16} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
