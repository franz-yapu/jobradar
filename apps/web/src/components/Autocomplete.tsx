import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { searchOptions } from "../lib/catalog/search";
import type { Option } from "../lib/catalog/search";
import { FIELD, FieldLabel } from "./ui";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Curated suggestions. */
  options?: readonly Option[];
  /** The user's own earlier values (other rows of the profile); shown with the curated ones. */
  own?: readonly string[];
  required?: boolean;
  maxLength?: number;
  error?: string;
  onBlur?: () => void;
}

/** Single-value text input with suggestions: type to filter, arrows and Enter (or a click) to pick; free text stays valid. */
export function Autocomplete({ label, value, onChange, options = [], own = [], required, maxLength = 200, error, onBlur }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const pool = useMemo(() => {
    const seen = new Set<string>();
    const merged: Option[] = [];
    for (const text of own) if (text.trim()) merged.push({ value: text.trim(), label: text.trim() });
    for (const option of options) merged.push(option);
    return merged.filter((option) => {
      const key = option.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options, own]);

  const rows = useMemo(
    () => searchOptions(pool, value).filter((row) => row.value.toLowerCase() !== value.trim().toLowerCase()),
    [pool, value],
  );

  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setActive(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(rows.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && rows[active]) {
      event.preventDefault();
      pick(rows[active].value);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const showList = open && rows.length > 0;
  return (
    <div ref={root} className="relative">
      <label htmlFor={id}>
        <FieldLabel>{label}</FieldLabel>
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${id}-opt-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`${FIELD} aria-[invalid=true]:border-danger`}
        value={value}
        required={required}
        maxLength={maxLength}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {showList ? (
        <ul id={listId} role="listbox" aria-label={label} className="pop absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-line-strong bg-card p-1.5 shadow-pop">
          {rows.map((row, index) => (
            <li
              key={row.value}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === active ? "bg-primary-soft text-primary-ink" : "text-ink"}`}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(row.value)}
            >
              {row.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
