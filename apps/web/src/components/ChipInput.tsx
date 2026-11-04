import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  label: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Returns the cleaned value, or null to reject it. */
  normalize?: (raw: string) => string | null;
  invalidMessage?: string;
}

export function ChipInput({ label, hint, values, onChange, normalize, invalidMessage }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const raw = draft.trim().replace(/,$/, "").trim();
    if (!raw) return;
    const value = normalize ? normalize(raw) : raw;
    if (value === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft("");
    if (!values.includes(value)) onChange([...values, value]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="text-sm">
      <label htmlFor={id} className="block">
        {label}
      </label>
      <ul className="my-1 flex flex-wrap gap-1" aria-label={label}>
        {values.map((value) => (
          <li key={value} className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5">
            {value}
            <button
              type="button"
              className="text-slate-600 hover:text-slate-900"
              aria-label={t("profile.remove", { item: value })}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1"
        value={draft}
        placeholder={hint}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        aria-invalid={invalid}
      />
      {invalid && invalidMessage ? <p className="mt-1 text-xs text-red-700">{invalidMessage}</p> : null}
    </div>
  );
}
