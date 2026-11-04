import { CreatePostingSchema, REMOTE_SCOPES } from "@jobradar/shared";
import type { RemoteScope } from "@jobradar/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { toCreatePosting } from "../lib/manual-posting";

const FIELD = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm";

export function NewPostingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ text: "", title: "", company: "", url: "", location: "", remoteScope: "unknown" as RemoteScope });
  const [scoreNow, setScoreNow] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = await toCreatePosting(form);
      const checked = CreatePostingSchema.safeParse(body);
      if (!checked.success) throw new FormProblem(checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
      const posting = await api.createPosting(body);
      if (scoreNow) await api.scorePosting(posting.id);
      return posting;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["postings"] });
      void navigate("/");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (!form.text.trim()) {
      setProblem(t("add.textRequired"));
      return;
    }
    save.mutate();
  }

  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const duplicate = save.error instanceof ApiError && save.error.status === 409;

  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold">{t("add.title")}</h2>
      <p className="mb-4 text-sm text-slate-600">{t("add.intro")}</p>
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-sm">
          {t("add.text")}
          <textarea
            className={`${FIELD} mt-1 h-56`}
            value={form.text}
            placeholder={t("add.textPlaceholder")}
            onChange={(event) => set("text")(event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["title", "add.title_field"],
              ["company", "add.company"],
              ["url", "add.url"],
              ["location", "add.location"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {t(label)} <span className="text-xs text-slate-500">({t("add.optional")})</span>
              <input className={`${FIELD} mt-1`} value={form[key]} onChange={(event) => set(key)(event.target.value)} />
            </label>
          ))}
          <label className="block text-sm">
            {t("add.scope")} <span className="text-xs text-slate-500">({t("add.optional")})</span>
            <select className={`${FIELD} mt-1`} value={form.remoteScope} onChange={(event) => set("remoteScope")(event.target.value)}>
              {REMOTE_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {t(`scope.${scope}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={scoreNow} onChange={(event) => setScoreNow(event.target.checked)} />
          {t("add.scoreNow")}
        </label>
        {problem ? (
          <p role="alert" className="text-sm text-red-700">
            {problem}
          </p>
        ) : null}
        {duplicate ? (
          <p role="alert" className="text-sm text-amber-800">
            {t("add.duplicate")} <Link className="underline" to="/">{t("add.viewList")}</Link>
          </p>
        ) : null}
        {save.error instanceof FormProblem ? (
          <p role="alert" className="text-sm text-red-700">
            {t("add.invalid", { message: save.error.message })}
          </p>
        ) : null}
        {save.isError && !duplicate && !(save.error instanceof FormProblem) ? <ErrorMessage error={save.error} /> : null}
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={save.isPending}
        >
          {save.isPending ? t("add.saving") : t("add.submit")}
        </button>
      </form>
    </section>
  );
}

class FormProblem extends Error {}
