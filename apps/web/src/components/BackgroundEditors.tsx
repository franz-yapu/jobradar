import { ENGLISH_LEVELS } from "@jobradar/shared";
import type { Education, Experience, LanguageSkill } from "@jobradar/shared";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon, CloseIcon } from "./icons";
import { MonthYearInput } from "./MonthYearInput";
import { Autocomplete } from "./Autocomplete";
import { Select } from "./Select";
import { Button, Card, FIELD, FieldLabel } from "./ui";
import { DEGREE_OPTIONS, FIELD_OF_STUDY_OPTIONS, ROLE_OPTIONS } from "../lib/catalog/background";
import { languageNameOptions } from "../lib/catalog/languages";
import type { Option } from "../lib/catalog/search";
import type { FieldErrors } from "../lib/profile-errors";

const GRID = "grid gap-3 sm:grid-cols-2";

interface Validation {
  errors?: FieldErrors;
  /** Called when a field loses focus, so its error can start showing. */
  onTouch?: (path: string) => void;
  /** Paths whose errors may be shown (blurred, or the form was submitted). */
  shown?: ReadonlySet<string>;
}

function TextInput({ label, value, onChange, required, options, own, path, validation }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; options?: readonly Option[]; own?: readonly string[]; path: string; validation: Validation }) {
  const { t } = useTranslation();
  const error = validation.errors?.[path] && validation.shown?.has(path) ? t(`profile.errors.${validation.errors[path]}`) : undefined;
  return <Autocomplete label={label} value={value} onChange={onChange} required={required} options={options} own={own} error={error} onBlur={() => validation.onTouch?.(path)} />;
}

function ItemBox({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="relative rounded-md border border-line p-4" data-testid="background-item">
      <Button variant="ghost" size="sm" className="absolute right-2 top-2" aria-label={t("profile.removeItem", { item: label })} onClick={onRemove}>
        <CloseIcon width={14} height={14} />
      </Button>
      {children}
    </li>
  );
}

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, position) => (position === index ? next : item));
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}

interface ListProps<T> extends Validation {
  items: T[];
  onChange: (items: T[]) => void;
}

export function EducationEditor({ items, onChange, ...validation }: ListProps<Education>) {
  const { t } = useTranslation();
  const add = () => onChange([...items, { institution: "", degree: "" }]);
  return (
    <Card
      title={t("profile.education.title")}
      actions={
        <Button variant="outline" size="sm" onClick={add}>
          <PlusIcon width={14} height={14} />
          {t("profile.education.add")}
        </Button>
      }
    >
      {items.length === 0 ? <p className="text-sm text-muted">{t("profile.education.empty")}</p> : null}
      <ul className="space-y-3">
        {items.map((item, index) => (
          <ItemBox key={index} label={item.institution || t("profile.education.title")} onRemove={() => onChange(removeAt(items, index))}>
            <div className={GRID}>
              <TextInput path={`education.${index}.institution`} validation={validation} label={t("profile.education.institution")} own={items.map((entry) => entry.institution)} value={item.institution} onChange={(institution) => onChange(replaceAt(items, index, { ...item, institution }))} />
              <TextInput path={`education.${index}.degree`} validation={validation} label={t("profile.education.degree")} options={DEGREE_OPTIONS} own={items.map((entry) => entry.degree)} value={item.degree} onChange={(degree) => onChange(replaceAt(items, index, { ...item, degree }))} />
              <TextInput path={`education.${index}.field`} validation={validation} label={t("profile.education.field")} options={FIELD_OF_STUDY_OPTIONS} own={items.map((entry) => entry.field ?? "")} value={item.field ?? ""} onChange={(field) => onChange(replaceAt(items, index, { ...item, field }))} />
              <MonthYearInput label={t("profile.start")} year={item.startYear} month={item.startMonth} onChange={({ year, month }) => onChange(replaceAt(items, index, { ...item, startYear: year, startMonth: month }))} />
              <MonthYearInput label={t("profile.end")} year={item.endYear} month={item.endMonth} onChange={({ year, month }) => onChange(replaceAt(items, index, { ...item, endYear: year, endMonth: month }))} />
            </div>
          </ItemBox>
        ))}
      </ul>
    </Card>
  );
}

export function ExperienceEditor({ items, onChange, ...validation }: ListProps<Experience>) {
  const { t } = useTranslation();
  const add = () => onChange([...items, { company: "", role: "", current: false, highlights: [] }]);
  return (
    <Card
      title={t("profile.experience.title")}
      actions={
        <Button variant="outline" size="sm" onClick={add}>
          <PlusIcon width={14} height={14} />
          {t("profile.experience.add")}
        </Button>
      }
    >
      {items.length === 0 ? <p className="text-sm text-muted">{t("profile.experience.empty")}</p> : null}
      <ul className="space-y-3">
        {items.map((item, index) => {
          const update = (patch: Partial<Experience>) => onChange(replaceAt(items, index, { ...item, ...patch }));
          return (
            <ItemBox key={index} label={item.company || t("profile.experience.title")} onRemove={() => onChange(removeAt(items, index))}>
              <div className={GRID}>
                <TextInput path={`experience.${index}.company`} validation={validation} label={t("profile.experience.company")} own={items.map((entry) => entry.company)} value={item.company} onChange={(company) => update({ company })} />
                <TextInput path={`experience.${index}.role`} validation={validation} label={t("profile.experience.role")} options={ROLE_OPTIONS} own={items.map((entry) => entry.role)} value={item.role} onChange={(role) => update({ role })} />
                <MonthYearInput label={t("profile.start")} year={item.startYear} month={item.startMonth} onChange={({ year, month }) => update({ startYear: year, startMonth: month })} />
                <MonthYearInput label={t("profile.end")} year={item.current ? undefined : item.endYear} month={item.current ? undefined : item.endMonth} disabled={item.current} onChange={({ year, month }) => update({ endYear: year, endMonth: month })} />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={item.current}
                    onChange={(event) => update({ current: event.target.checked, endYear: event.target.checked ? undefined : item.endYear, endMonth: event.target.checked ? undefined : item.endMonth })}
                  />
                  {t("profile.experience.current")}
                </label>
              </div>
              <label className="mt-3 block">
                <FieldLabel hint={t("profile.experience.highlightsHint")}>{t("profile.experience.highlights")}</FieldLabel>
                <textarea
                  className={`${FIELD} h-24`}
                  value={item.highlights.join("\n")}
                  onChange={(event) => update({ highlights: event.target.value.split("\n").slice(0, 5) })}
                />
              </label>
            </ItemBox>
          );
        })}
      </ul>
    </Card>
  );
}

export function LanguagesEditor({ items, onChange, ...validation }: ListProps<LanguageSkill>) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const languageOptions = useMemo(() => languageNameOptions(language), [language]);
  const levelOptions = [...ENGLISH_LEVELS.map((level) => ({ value: level, label: level })), { value: "native", label: t("profile.languages.native") }];
  const add = () => onChange([...items, { language: "", level: "" }]);
  return (
    <Card
      title={t("profile.languages.title")}
      actions={
        <Button variant="outline" size="sm" onClick={add}>
          <PlusIcon width={14} height={14} />
          {t("profile.languages.add")}
        </Button>
      }
    >
      {items.length === 0 ? <p className="text-sm text-muted">{t("profile.languages.empty")}</p> : null}
      <ul className="space-y-3">
        {items.map((item, index) => (
          <ItemBox key={index} label={item.language || t("profile.languages.title")} onRemove={() => onChange(removeAt(items, index))}>
            <div className={GRID}>
              <Select
                label={t("profile.languages.language")}
                error={validation.errors?.[`languages.${index}.language`] && validation.shown?.has(`languages.${index}.language`) ? t("profile.errors.required") : undefined}
                onBlur={() => validation.onTouch?.(`languages.${index}.language`)}
                placeholder="—"
                value={item.language}
                options={languageOptions}
                onChange={(language) => onChange(replaceAt(items, index, { ...item, language }))}
              />
              <Select
                label={t("profile.languages.level")}
                error={validation.errors?.[`languages.${index}.level`] && validation.shown?.has(`languages.${index}.level`) ? t("profile.errors.required") : undefined}
                onBlur={() => validation.onTouch?.(`languages.${index}.level`)}
                placeholder="—"
                value={item.level}
                options={levelOptions}
                onChange={(level) => onChange(replaceAt(items, index, { ...item, level }))}
              />
            </div>
          </ItemBox>
        ))}
      </ul>
    </Card>
  );
}
