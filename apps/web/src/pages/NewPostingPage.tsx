import { CreatePostingSchema, REMOTE_SCOPES } from "@jobradar/shared";
import type { RemoteScope } from "@jobradar/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { PlusIcon } from "../components/icons";
import { Alert, Button, Card, FIELD, FieldLabel, PageHeader } from "../components/ui";
import { toCreatePosting } from "../lib/manual-posting";

class FormProblem extends Error {}

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

  function submit(event: SyntheticEvent) {
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
    <div className="space-y-5">
      <PageHeader icon={<PlusIcon />} title={t("add.title")} description={t("add.intro")} />
      <form className="space-y-5" onSubmit={submit}>
        <Card>
          <label className="block">
            <FieldLabel>{t("add.text")}</FieldLabel>
            <textarea
              className={`${FIELD} h-56`}
              value={form.text}
              placeholder={t("add.textPlaceholder")}
              onChange={(event) => set("text")(event.target.value)}
            />
          </label>
        </Card>
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["title", "add.title_field"],
                ["company", "add.company"],
                ["url", "add.url"],
                ["location", "add.location"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <FieldLabel hint={t("add.optional")}>{t(label)}</FieldLabel>
                <input className={FIELD} value={form[key]} onChange={(event) => set(key)(event.target.value)} />
              </label>
            ))}
            <label className="block">
              <FieldLabel hint={t("add.optional")}>{t("add.scope")}</FieldLabel>
              <select className={FIELD} value={form.remoteScope} onChange={(event) => set("remoteScope")(event.target.value)}>
                {REMOTE_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {t(`scope.${scope}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={scoreNow} onChange={(event) => setScoreNow(event.target.checked)} />
          {t("add.scoreNow")}
        </label>
        {problem ? <Alert tone="danger">{problem}</Alert> : null}
        {duplicate ? (
          <Alert tone="warning">
            {t("add.duplicate")}{" "}
            <Link className="font-medium underline" to="/">
              {t("add.viewList")}
            </Link>
          </Alert>
        ) : null}
        {save.error instanceof FormProblem ? <Alert tone="danger">{t("add.invalid", { message: save.error.message })}</Alert> : null}
        {save.isError && !duplicate && !(save.error instanceof FormProblem) ? <ErrorMessage error={save.error} /> : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t("add.saving") : t("add.submit")}
        </Button>
      </form>
    </div>
  );
}
