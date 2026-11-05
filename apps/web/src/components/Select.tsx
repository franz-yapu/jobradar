import type { Option } from "../lib/catalog/search";
import { ChevronDownIcon } from "./icons";
import { FIELD, FieldLabel } from "./ui";

interface Props {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  hint?: string;
  /** Text of an empty first option; without it a value must be chosen. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
}

/** A native select (best on phones and for screen readers) with the app's look and its own chevron. */
export function Select({ label, value, options, onChange, hint, placeholder, disabled, required, error, onBlur }: Props) {
  const known = options.some((option) => option.value === value);
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <span className="relative block">
        <select
          className={`peer ${FIELD} h-[2.625rem] cursor-pointer appearance-none truncate bg-none py-0 pl-3 pr-10 leading-tight aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted ${value === "" ? "text-muted" : ""}`}
          value={value}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {/* a stored value the list does not know (older profiles) stays selectable instead of vanishing */}
          {value && !known ? <option value={value}>{value}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon width={16} height={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted peer-disabled:opacity-50" />
      </span>
      {error ? <p className="mt-1 text-sm text-danger-ink">{error}</p> : null}
    </label>
  );
}
