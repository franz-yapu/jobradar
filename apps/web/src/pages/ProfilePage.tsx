import { CONTRACT_TYPES, ENGLISH_LEVELS, SaveProfileSchema, SENIORITIES } from "@jobradar/shared";
import type { ContractType, CvDraft, CvWarning, EnglishLevel, Seniority } from "@jobradar/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { EducationEditor, ExperienceEditor, LanguagesEditor } from "../components/BackgroundEditors";
import { ChipInput } from "../components/ChipInput";
import { Combobox } from "../components/Combobox";
import { CvImportCard } from "../components/CvImportCard";
import { ErrorMessage } from "../components/ErrorMessage";
import { MultiSelect } from "../components/MultiSelect";
import { Select } from "../components/Select";
import { UserIcon } from "../components/icons";
import { Alert, Button, Card, FIELD, PageHeader } from "../components/ui";
import { locationOptions } from "../lib/catalog/countries";
import { STACK_OPTIONS } from "../lib/catalog/stack";
import { EMPTY_FORM, formFromProfile, toSaveBody } from "../lib/profile-form";
import type { ProfileForm } from "../lib/profile-form";

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const locations = useMemo(
    () => locationOptions(language, { latam: t("profile.locationKeywords.latam"), worldwide: t("profile.locationKeywords.worldwide") }),
    [language, t],
  );
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

  // An imported CV draft only exists in this page: leaving without saving would silently lose it.
  const hasUnsavedDraft = draftWarnings !== null;
  useEffect(() => {
    if (!hasUnsavedDraft) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedDraft]);

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    setProblem(null);
    const body = toSaveBody(form);
    const checked = SaveProfileSchema.safeParse(body);
    if (!checked.success) {
      setProblem(
        [...new Set(checked.error.issues.map((issue) => {
          const field = String(issue.path[0] ?? "");
          return t([`profile.problems.${field}`, "profile.problems.other"], { path: issue.path.join("."), message: issue.message });
        }))].join(" "),
      );
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

  return (
    <div className="space-y-5">
      <PageHeader icon={<UserIcon />} title={t("profile.title")} description={query.data ? t("profile.intro") : t("profile.empty")} />

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
            <Combobox
              label={t("profile.stack")}
              placeholder={t("profile.stackHint")}
              values={form.stack}
              options={STACK_OPTIONS}
              onChange={(stack) => setForm({ ...form, stack })}
              normalizeCustom={(raw) => (raw.length <= 50 ? raw : null)}
            />
            <Combobox
              label={t("profile.locations")}
              placeholder={t("profile.locationsHint")}
              values={form.allowedLocations}
              options={locations}
              onChange={(allowedLocations) => setForm({ ...form, allowedLocations })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t("profile.seniority")}
                value={form.seniority}
                options={SENIORITIES.map((level) => ({ value: level, label: t(`profile.seniorities.${level}`) }))}
                onChange={(value) => setForm({ ...form, seniority: value as Seniority })}
              />
              <Select
                label={t("profile.english")}
                value={form.maxEnglishLevel}
                options={ENGLISH_LEVELS.map((level) => ({ value: level, label: level }))}
                onChange={(value) => setForm({ ...form, maxEnglishLevel: value as EnglishLevel })}
              />
            </div>
            <MultiSelect
              label={t("profile.contracts")}
              placeholder={t("profile.noneExcluded")}
              values={form.excludedContractTypes}
              options={CONTRACT_TYPES.map((type) => ({ value: type, label: t(`profile.contractTypes.${type}`) }))}
              onChange={(excludedContractTypes) => setForm({ ...form, excludedContractTypes: excludedContractTypes as ContractType[] })}
            />
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

        {problem ? <Alert tone="danger">{problem}</Alert> : null}
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
