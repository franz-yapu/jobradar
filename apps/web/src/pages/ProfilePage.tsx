import { CONTRACT_TYPES, ENGLISH_LEVELS, SaveProfileSchema, SENIORITIES } from "@jobradar/shared";
import type { ContractType, EnglishLevel, ProfileResponse, SaveProfileInput, Seniority } from "@jobradar/shared";

type Background = Pick<ProfileResponse, "education" | "experience" | "languages" | "certifications">;
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { ChipInput } from "../components/ChipInput";
import { ErrorMessage } from "../components/ErrorMessage";
import { normalizeLocation } from "../lib/locations";

const FIELD = "rounded border border-slate-300 bg-white px-2 py-1 text-sm";

interface FormState {
  stack: string[];
  seniority: Seniority;
  allowedLocations: string[];
  maxEnglishLevel: EnglishLevel;
  excludedContractTypes: ContractType[];
  summary: string;
  /** Not editable on this screen yet (the CV import fills it); carried along so saving never wipes it. */
  background: Background;
}

const EMPTY: FormState = {
  stack: [],
  seniority: "mid",
  allowedLocations: [],
  maxEnglishLevel: "B2",
  excludedContractTypes: [],
  summary: "",
  background: { education: [], experience: [], languages: [], certifications: [] },
};

function fromProfile(profile: ProfileResponse): FormState {
  return {
    stack: profile.stack,
    seniority: profile.seniority,
    allowedLocations: profile.allowedLocations,
    maxEnglishLevel: profile.maxEnglishLevel,
    excludedContractTypes: profile.excludedContractTypes,
    summary: profile.summary,
    background: {
      education: profile.education,
      experience: profile.experience,
      languages: profile.languages,
      certifications: profile.certifications,
    },
  };
}

export function ProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api.getProfile() });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) setForm(fromProfile(query.data));
  }, [query.data]);

  const save = useMutation({
    mutationFn: (body: SaveProfileInput) => api.saveProfile(body),
    onSuccess: (saved) => {
      queryClient.setQueryData(["profile"], saved);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    const { background, ...editable } = form;
    const body: SaveProfileInput = { ...editable, ...background };
    const checked = SaveProfileSchema.safeParse(body);
    if (!checked.success) {
      setProblem(checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
      return;
    }
    save.mutate(body);
  }

  if (query.isPending) return <p>{t("postings.loading")}</p>;
  if (query.isError) return <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />;

  const toggleContract = (type: ContractType) =>
    setForm({
      ...form,
      excludedContractTypes: form.excludedContractTypes.includes(type)
        ? form.excludedContractTypes.filter((item) => item !== type)
        : [...form.excludedContractTypes, type],
    });

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold">{t("profile.title")}</h2>
      <p className="mb-4 text-sm text-slate-600">{query.data ? t("profile.intro") : t("profile.empty")}</p>
      <form className="space-y-4" onSubmit={submit}>
        <ChipInput label={t("profile.stack")} hint={t("profile.stackHint")} values={form.stack} onChange={(stack) => setForm({ ...form, stack })} />
        <ChipInput
          label={t("profile.locations")}
          hint={t("profile.locationsHint")}
          values={form.allowedLocations}
          onChange={(allowedLocations) => setForm({ ...form, allowedLocations })}
          normalize={normalizeLocation}
          invalidMessage={t("profile.invalidLocation")}
        />
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("profile.seniority")}
            <select className={FIELD} value={form.seniority} onChange={(event) => setForm({ ...form, seniority: event.target.value as Seniority })}>
              {SENIORITIES.map((level) => (
                <option key={level} value={level}>
                  {t(`profile.seniorities.${level}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("profile.english")}
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
        <fieldset className="text-sm">
          <legend className="mb-1">{t("profile.contracts")}</legend>
          <div className="flex flex-wrap gap-4">
            {CONTRACT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2">
                <input type="checkbox" checked={form.excludedContractTypes.includes(type)} onChange={() => toggleContract(type)} />
                {t(`profile.contractTypes.${type}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          {t("profile.summary")}
          <textarea
            className={`${FIELD} mt-1 h-28 w-full`}
            value={form.summary}
            maxLength={2000}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
          />
        </label>
        {problem ? (
          <p role="alert" className="text-sm text-red-700">
            {t("profile.invalid", { message: problem })}
          </p>
        ) : null}
        {save.isError ? <ErrorMessage error={save.error} /> : null}
        {save.isSuccess ? (
          <p role="status" className="text-sm text-green-800">
            {t("profile.saved", { version: save.data.version })}
          </p>
        ) : null}
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={save.isPending}>
          {save.isPending ? t("profile.saving") : t("profile.save")}
        </button>
      </form>
    </section>
  );
}
