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
}

/** A native select (best on phones and for screen readers) with the app's look and its own chevron. */
export function Select({ label, value, options, onChange, hint, placeholder, disabled, required }: Props) {
  const known = options.some((option) => option.value === value);
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <span className="relative block">
        <select
          className={`${FIELD} cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted`}
          value={value}
          disabled={disabled}
          required={required}
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
        <ChevronDownIcon width={16} height={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}
