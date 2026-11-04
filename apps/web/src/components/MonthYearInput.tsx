import { useTranslation } from "react-i18next";
import { Select } from "./Select";
import { FieldLabel } from "./ui";

interface Props {
  label: string;
  year: number | undefined;
  month: number | undefined;
  onChange: (value: { year: number | undefined; month: number | undefined }) => void;
  disabled?: boolean;
}

const FIRST_YEAR = 1950;

/** Month and year as two selects (names in the active language), instead of a browser date picker. */
export function MonthYearInput({ label, year, month, onChange, disabled }: Props) {
  const { t, i18n } = useTranslation();
  const monthName = new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: "long" });
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: monthName.format(new Date(2000, index, 1)),
  }));
  const last = new Date().getFullYear() + 1;
  const years = Array.from({ length: last - FIRST_YEAR + 1 }, (_, index) => {
    const value = String(last - index);
    return { value, label: value };
  });

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend>
        <FieldLabel>{label}</FieldLabel>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <Select
          label={t("profile.month")}
          placeholder="—"
          value={month === undefined ? "" : String(month)}
          options={months}
          disabled={disabled || year === undefined}
          onChange={(value) => onChange({ year, month: value === "" ? undefined : Number(value) })}
        />
        <Select
          label={t("profile.year")}
          placeholder="—"
          value={year === undefined ? "" : String(year)}
          options={years}
          disabled={disabled}
          onChange={(value) => onChange(value === "" ? { year: undefined, month: undefined } : { year: Number(value), month })}
        />
      </div>
    </fieldset>
  );
}
