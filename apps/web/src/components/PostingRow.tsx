import type { PostingListItemResponse } from "@jobradar/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isWebUrl } from "../lib/manual-posting";
import { ChevronDownIcon } from "./icons";
import { ErrorMessage } from "./ErrorMessage";
import { Button } from "./ui";
import { VerdictBadge } from "./VerdictBadge";

interface Props {
  posting: PostingListItemResponse;
  scoring: boolean;
  scoreError: unknown;
  onScore: (postingId: string) => void;
}

export function PostingRow({ posting, scoring, scoreError, onScore }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const score = posting.latestScore;
  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium" });
  const detailsId = `details-${posting.id}`;
  const web = isWebUrl(posting.url);

  return (
    <li className="px-5 py-4 transition-colors hover:bg-page" data-testid="posting-row">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {web ? (
              <a href={posting.url} target="_blank" rel="noreferrer noopener" className="text-ink hover:text-primary hover:underline">
                {posting.title}
              </a>
            ) : (
              posting.title
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {posting.company}
            {posting.location ? ` · ${posting.location}` : ""} · {t(`scope.${posting.remoteScope}`)}
            {web ? "" : ` · ${t("row.manualEntry")}`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {posting.publishedAt
              ? t("row.published", { date: dateFormat.format(new Date(posting.publishedAt)) })
              : t("row.stored", { date: dateFormat.format(new Date(posting.createdAt)) })}
          </p>
          {score?.reasons[0] ? <p className="mt-2 text-sm text-ink">{score.reasons[0]}</p> : null}
        </div>
        <div className="flex flex-row-reverse items-center justify-between gap-2 sm:flex-col sm:items-end">
          <VerdictBadge verdict={score?.verdict ?? null} />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={scoring} onClick={() => onScore(posting.id)}>
              {scoring ? t("score.scoring") : score ? t("score.again") : t("score.now")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen(!open)}
            >
              {open ? t("row.hideDetails") : t("row.details")}
              <ChevronDownIcon width={14} height={14} className={open ? "rotate-180" : ""} />
            </Button>
          </div>
        </div>
      </div>
      {scoreError ? (
        <div className="mt-3">
          <ErrorMessage error={scoreError} />
        </div>
      ) : null}
      {open ? (
        <div id={detailsId} className="mt-4 space-y-4 rounded-lg bg-page p-4 text-sm">
          {score ? (
            <>
              <div>
                <h4 className="mb-1 font-semibold">{t("row.reasons")}</h4>
                <ul className="list-inside list-disc space-y-0.5 text-ink">
                  {score.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
              {score.blockers.length > 0 ? (
                <div>
                  <h4 className="mb-1 font-semibold">{t("row.blockers")}</h4>
                  <ul className="list-inside list-disc space-y-0.5 text-ink">
                    {score.blockers.map((blocker) => (
                      <li key={`${blocker.type}-${blocker.evidence}`}>
                        <strong>{t(`blocker.${blocker.type}`)}:</strong> {blocker.evidence}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-muted">{t("row.noReasons")}</p>
          )}
          {web ? (
            <a href={posting.url} target="_blank" rel="noreferrer noopener" className="inline-block font-medium text-primary hover:underline">
              {t("row.open")}
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
