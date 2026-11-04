import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Option } from "../lib/catalog/search";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { FIELD, FieldLabel } from "./ui";

interface Props {
  label: string;
  hint?: string;
  values: string[];
  options: readonly Option[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/** A button that opens a checklist: pick any number of fixed options. */
export function MultiSelect({ label, hint, values, options, onChange, placeholder }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const chosen = options.filter((option) => values.includes(option.value));
  const summary = chosen.length === 0 ? (placeholder ?? t("profile.choose")) : chosen.map((option) => option.label).join(", ");

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <div ref={root} className="relative">
      <span id={`${id}-label`}>
        <FieldLabel hint={hint}>{label}</FieldLabel>
      </span>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        className={`${FIELD} flex cursor-pointer items-center justify-between gap-2 text-left`}
        onClick={() => setOpen(!open)}
      >
        <span id={`${id}-value`} className={`truncate ${chosen.length === 0 ? "text-muted" : ""}`}>
          {summary}
        </span>
        <ChevronDownIcon width={16} height={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div role="group" aria-labelledby={`${id}-label`} className="pop absolute left-0 right-0 z-30 mt-1 rounded-xl border border-line-strong bg-card p-1.5 shadow-pop">
          {options.map((option) => {
            const checked = values.includes(option.value);
            return (
              <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-raised">
                <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(option.value)} />
                <span
                  aria-hidden="true"
                  className={`flex size-5 items-center justify-center rounded border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
                    checked ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-card"
                  }`}
                >
                  {checked ? <CheckIcon width={14} height={14} /> : null}
                </span>
                {option.label}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
