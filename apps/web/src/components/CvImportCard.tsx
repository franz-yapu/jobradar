import type { CvDraft } from "@jobradar/shared";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../api/client";
import { ErrorMessage } from "./ErrorMessage";
import { Alert, Button, Card } from "./ui";

export const MAX_CV_BYTES = 5 * 1024 * 1024;

/** Cheap checks before uploading; the API checks again by content. Returns the error code to show, if any. */
export function checkCvFile(file: File): "cv_not_pdf" | "cv_too_large" | null {
  const looksLikePdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) return "cv_not_pdf";
  if (file.size > MAX_CV_BYTES) return "cv_too_large";
  return null;
}

/** Upload a CV (PDF) and hand the extracted draft to the form; nothing is saved here. */
export function CvImportCard({ onDraft }: { onDraft: (draft: CvDraft) => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  /** Changing the key empties the native file input after a successful import. */
  const [inputKey, setInputKey] = useState(0);
  const [localError, setLocalError] = useState<ReturnType<typeof checkCvFile>>(null);

  const read = useMutation({
    mutationFn: (selected: File) => api.importCv(selected),
    onSuccess: (draft) => {
      onDraft(draft);
      setFile(null);
      setInputKey((key) => key + 1);
    },
  });

  function choose(selected: File | null) {
    read.reset();
    setFile(selected);
    setLocalError(selected ? checkCvFile(selected) : null);
  }

  const localProblem = localError ? new ApiError(localError === "cv_too_large" ? 413 : 415, localError, localError) : null;

  return (
    <Card title={t("profile.cv.title")}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{t("profile.cv.intro")}</p>
        <Alert tone="info" role="note">
          {t("profile.cv.privacy")}
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={inputId} className="sr-only">
            {t("profile.cv.choose")}
          </label>
          <input
            key={inputKey}
            id={inputId}
            type="file"
            accept="application/pdf,.pdf"
            className="block max-w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-card file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-primary-soft"
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
          <Button disabled={!file || localError !== null || read.isPending} onClick={() => file && read.mutate(file)}>
            {read.isPending ? t("profile.cv.analyzing") : t("profile.cv.analyze")}
          </Button>
        </div>
        {read.isPending ? (
          <p role="status" className="text-sm text-muted">
            {t("profile.cv.wait")}
          </p>
        ) : null}
        {localProblem ? <ErrorMessage error={localProblem} /> : null}
        {read.isError ? <ErrorMessage error={read.error} /> : null}
      </div>
    </Card>
  );
}
