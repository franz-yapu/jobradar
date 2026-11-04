import type { Education, Experience, LanguageSkill } from "@jobradar/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon, CloseIcon } from "./icons";
import { Button, Card, FIELD, FieldLabel } from "./ui";

const GRID = "grid gap-3 sm:grid-cols-2";

function YearInput({ label, value, disabled, onChange }: { label: string; value: number | undefined; disabled?: boolean; onChange: (year: number | undefined) => void }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        className={FIELD}
        type="number"
        inputMode="numeric"
        min={1950}
        max={2100}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
      />
    </label>
  );
}

function TextInput({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input className={FIELD} value={value} required={required} maxLength={200} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ItemBox({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="relative rounded-lg border border-line p-4" data-testid="background-item">
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

interface ListProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
}

export function EducationEditor({ items, onChange }: ListProps<Education>) {
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
              <TextInput label={t("profile.education.institution")} value={item.institution} onChange={(institution) => onChange(replaceAt(items, index, { ...item, institution }))} />
              <TextInput label={t("profile.education.degree")} value={item.degree} onChange={(degree) => onChange(replaceAt(items, index, { ...item, degree }))} />
              <TextInput label={t("profile.education.field")} value={item.field ?? ""} onChange={(field) => onChange(replaceAt(items, index, { ...item, field }))} />
              <div className="grid grid-cols-2 gap-3">
                <YearInput label={t("profile.start")} value={item.startYear} onChange={(startYear) => onChange(replaceAt(items, index, { ...item, startYear }))} />
                <YearInput label={t("profile.end")} value={item.endYear} onChange={(endYear) => onChange(replaceAt(items, index, { ...item, endYear }))} />
              </div>
            </div>
          </ItemBox>
        ))}
      </ul>
    </Card>
  );
}

export function ExperienceEditor({ items, onChange }: ListProps<Experience>) {
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
                <TextInput label={t("profile.experience.company")} value={item.company} onChange={(company) => update({ company })} />
                <TextInput label={t("profile.experience.role")} value={item.role} onChange={(role) => update({ role })} />
                <div className="grid grid-cols-2 gap-3">
                  <YearInput label={t("profile.start")} value={item.startYear} onChange={(startYear) => update({ startYear })} />
                  <YearInput label={t("profile.end")} value={item.current ? undefined : item.endYear} disabled={item.current} onChange={(endYear) => update({ endYear })} />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={item.current}
                    onChange={(event) => update({ current: event.target.checked, endYear: event.target.checked ? undefined : item.endYear })}
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

export function LanguagesEditor({ items, onChange }: ListProps<LanguageSkill>) {
  const { t } = useTranslation();
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
              <TextInput label={t("profile.languages.language")} value={item.language} onChange={(language) => onChange(replaceAt(items, index, { ...item, language }))} />
              <TextInput label={t("profile.languages.level")} value={item.level} onChange={(level) => onChange(replaceAt(items, index, { ...item, level }))} />
            </div>
          </ItemBox>
        ))}
      </ul>
    </Card>
  );
}
