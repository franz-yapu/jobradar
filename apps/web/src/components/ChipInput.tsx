import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "./icons";
import { FIELD, FieldLabel } from "./ui";

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
    <div>
      <label htmlFor={id}>
        <FieldLabel>{label}</FieldLabel>
      </label>
      {values.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((value) => (
            <li key={value} className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-ink">
              {value}
              <button
                type="button"
                className="-mr-1.5 flex size-6 items-center justify-center rounded hover:bg-primary hover:text-on-primary"
                aria-label={t("profile.remove", { item: value })}
                onClick={() => onChange(values.filter((item) => item !== value))}
              >
                <CloseIcon width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        className={FIELD}
        value={draft}
        placeholder={hint}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        aria-invalid={invalid}
      />
      {invalid && invalidMessage ? <p className="mt-1 text-xs text-danger-ink">{invalidMessage}</p> : null}
    </div>
  );
}
