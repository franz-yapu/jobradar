import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { searchOptions } from "../lib/catalog/search";
import type { Option } from "../lib/catalog/search";
import { CloseIcon } from "./icons";
import { FIELD, FieldLabel } from "./ui";

interface Props {
  label: string;
  hint?: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: readonly Option[];
  placeholder?: string;
  /** When set, text that matches no option can be added too; return null to reject it. */
  normalizeCustom?: (raw: string) => string | null;
  invalidMessage?: string;
}

/**
 * Multi-value autocomplete: type to filter the suggestions, arrows and Enter (or a click) to pick, chips to
 * review and remove. ARIA combobox + listbox, so keyboard and screen readers work.
 */
export function Combobox({ label, hint, values, onChange, options, placeholder, normalizeCustom, invalidMessage }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);

  const labels = useMemo(() => new Map(options.map((option) => [option.value, option.label])), [options]);
  const available = useMemo(() => options.filter((option) => !values.includes(option.value)), [options, values]);
  const matches = useMemo(() => searchOptions(available, query), [available, query]);
  const custom = normalizeCustom && query.trim() ? normalizeCustom(query.trim()) : null;
  const showCustom = custom !== null && !values.includes(custom) && !matches.some((match) => match.value === custom);
  const rows: Option[] = showCustom && custom !== null ? [...matches, { value: custom, label: t("profile.addCustom", { value: custom }) }] : matches;

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  function add(value: string) {
    setQuery("");
    setInvalid(false);
    setActive(0);
    if (!values.includes(value)) onChange([...values, value]);
  }

  function commit() {
    const row = rows[active];
    if (open && row) return add(row.value);
    const raw = query.trim().replace(/,$/, "").trim();
    if (!raw) return;
    const value = normalizeCustom ? normalizeCustom(raw) : null;
    if (value === null) return setInvalid(true);
    add(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(rows.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" || (event.key === "," && normalizeCustom)) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Backspace" && !query && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  const activeId = open && rows[active] ? `${id}-opt-${active}` : undefined;

  return (
    <div ref={root} className="relative">
      <label htmlFor={id}>
        <FieldLabel hint={hint}>{label}</FieldLabel>
      </label>
      {values.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((value) => {
            const text = labels.get(value) ?? value;
            return (
              <li key={value} className="flex items-center gap-1 rounded-md bg-primary-soft py-1 pl-2.5 pr-1 text-sm text-primary-ink">
                <span translate="no">{text}</span>
                <button
                  type="button"
                  aria-label={t("profile.remove", { item: text })}
                  className="flex size-6 items-center justify-center rounded text-primary-ink hover:bg-primary/15"
                  onClick={() => onChange(values.filter((item) => item !== value))}
                >
                  <CloseIcon width={12} height={12} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        className={FIELD}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setInvalid(false);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {invalid && invalidMessage ? (
        <p role="alert" className="mt-1 text-sm text-danger-ink">
          {invalidMessage}
        </p>
      ) : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="pop absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-line-strong bg-card p-1.5 shadow-pop"
        >
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{t("profile.noOptions")}</li>
          ) : (
            rows.map((row, index) => (
              <li
                key={row.value}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === active ? "bg-primary-soft text-primary-ink" : "text-ink"}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(row.value)}
              >
                {row.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
