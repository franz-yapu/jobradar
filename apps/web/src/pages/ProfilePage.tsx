import { CONTRACT_TYPES, ENGLISH_LEVELS, SaveProfileSchema, SENIORITIES } from "@jobradar/shared";
import type { ContractType, CvDraft, CvWarning, EnglishLevel, Seniority } from "@jobradar/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { EducationEditor, ExperienceEditor, LanguagesEditor } from "../components/BackgroundEditors";
import { ChipInput } from "../components/ChipInput";
import { CvImportCard } from "../components/CvImportCard";
import { ErrorMessage } from "../components/ErrorMessage";
import { Alert, Button, Card, FIELD, FieldLabel } from "../components/ui";
import { normalizeLocation } from "../lib/locations";
import { EMPTY_FORM, formFromProfile, toSaveBody } from "../lib/profile-form";
import type { ProfileForm } from "../lib/profile-form";

export function ProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api.getProfile() });
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  /** Set while the form holds an unsaved CV draft; the warnings are what the import could not find. */
  const [draftWarnings, setDraftWarnings] = useState<CvWarning[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) setForm(formFromProfile(query.data));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toSaveBody>) => api.saveProfile(body),
    onSuccess: (saved) => {
      setDraftWarnings(null);
      queryClient.setQueryData(["profile"], saved);
    },
  });

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    setProblem(null);
    const body = toSaveBody(form);
    const checked = SaveProfileSchema.safeParse(body);
    if (!checked.success) {
      setProblem(checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
      return;
    }
    save.mutate(body);
  }

  function loadDraft(draft: CvDraft) {
    save.reset();
    setProblem(null);
    setForm(formFromProfile(draft));
    setDraftWarnings(draft.warnings);
  }

  function discardDraft() {
    setForm(query.data ? formFromProfile(query.data) : EMPTY_FORM);
    setDraftWarnings(null);
  }

  if (query.isPending) return <p className="text-muted">{t("postings.loading")}</p>;
  if (query.isError) return <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />;

  const toggleContract = (type: ContractType) =>
    setForm({
      ...form,
      excludedContractTypes: form.excludedContractTypes.includes(type)
        ? form.excludedContractTypes.filter((item) => item !== type)
        : [...form.excludedContractTypes, type],
    });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{t("profile.title")}</h2>
        <p className="mt-1 text-sm text-muted">{query.data ? t("profile.intro") : t("profile.empty")}</p>
      </div>

      <CvImportCard onDraft={loadDraft} />

      {draftWarnings ? (
        <Alert tone="warning" role="status">
          <p className="font-medium">{t("profile.cv.banner")}</p>
          {draftWarnings.length > 0 ? (
            <>
              <p className="mt-2">{t("profile.cv.warningsTitle")}</p>
              <ul className="list-inside list-disc">
                {draftWarnings.map((warning) => (
                  <li key={warning}>{t(`profile.cv.warnings.${warning}`)}</li>
                ))}
              </ul>
            </>
          ) : null}
          <Button variant="outline" size="sm" className="mt-3" onClick={discardDraft}>
            {t("profile.cv.discard")}
          </Button>
        </Alert>
      ) : null}

      <form className="space-y-5" onSubmit={submit}>
        <Card title={t("profile.sectionSearch")}>
          <div className="space-y-5">
            <ChipInput label={t("profile.stack")} hint={t("profile.stackHint")} values={form.stack} onChange={(stack) => setForm({ ...form, stack })} />
            <ChipInput
              label={t("profile.locations")}
              hint={t("profile.locationsHint")}
              values={form.allowedLocations}
              onChange={(allowedLocations) => setForm({ ...form, allowedLocations })}
              normalize={normalizeLocation}
              invalidMessage={t("profile.invalidLocation")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel>{t("profile.seniority")}</FieldLabel>
                <select className={FIELD} value={form.seniority} onChange={(event) => setForm({ ...form, seniority: event.target.value as Seniority })}>
                  {SENIORITIES.map((level) => (
                    <option key={level} value={level}>
                      {t(`profile.seniorities.${level}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <FieldLabel>{t("profile.english")}</FieldLabel>
                <select
                  className={FIELD}
                  value={form.maxEnglishLevel}
                  onChange={(event) => setForm({ ...form, maxEnglishLevel: event.target.value as EnglishLevel })}
                >
                  {ENGLISH_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset>
              <legend>
                <FieldLabel>{t("profile.contracts")}</FieldLabel>
              </legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {CONTRACT_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={form.excludedContractTypes.includes(type)}
                      onChange={() => toggleContract(type)}
                    />
                    {t(`profile.contractTypes.${type}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        <Card title={t("profile.summary")}>
          <label className="block">
            <span className="sr-only">{t("profile.summary")}</span>
            <textarea
              className={`${FIELD} h-28`}
              value={form.summary}
              maxLength={2000}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
          </label>
        </Card>

        <ExperienceEditor items={form.experience} onChange={(experience) => setForm({ ...form, experience })} />
        <EducationEditor items={form.education} onChange={(education) => setForm({ ...form, education })} />
        <LanguagesEditor items={form.languages} onChange={(languages) => setForm({ ...form, languages })} />
        <Card title={t("profile.certifications.title")}>
          <ChipInput
            label={t("profile.certifications.title")}
            hint={t("profile.certifications.hint")}
            values={form.certifications}
            onChange={(certifications) => setForm({ ...form, certifications })}
          />
        </Card>

        {problem ? <Alert tone="danger">{t("profile.invalid", { message: problem })}</Alert> : null}
        {save.isError ? <ErrorMessage error={save.error} /> : null}
        {save.isSuccess ? (
          <Alert tone="success" role="status">
            {t("profile.saved", { version: save.data.version })}
          </Alert>
        ) : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t("profile.saving") : t("profile.save")}
        </Button>
      </form>
    </div>
  );
}
