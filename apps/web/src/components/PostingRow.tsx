import type { PostingListItemResponse } from "@jobradar/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorMessage } from "./ErrorMessage";
import { VerdictBadge } from "./VerdictBadge";
import { isWebUrl } from "../lib/manual-posting";

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

  return (
    <li className="px-3 py-3" data-testid="posting-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {isWebUrl(posting.url) ? (
              <a href={posting.url} target="_blank" rel="noreferrer noopener" className="text-blue-700 hover:underline">
                {posting.title}
              </a>
            ) : (
              posting.title
            )}
          </p>
          <p className="text-sm text-slate-600">
            {posting.company}
            {posting.location ? ` · ${posting.location}` : ""} · {t(`scope.${posting.remoteScope}`)}
            {isWebUrl(posting.url) ? "" : ` · ${t("row.manualEntry")}`}
          </p>
          <p className="text-xs text-slate-500">
            {posting.publishedAt
              ? t("row.published", { date: dateFormat.format(new Date(posting.publishedAt)) })
              : t("row.stored", { date: dateFormat.format(new Date(posting.createdAt)) })}
          </p>
          {score?.reasons[0] ? <p className="mt-1 text-sm text-slate-700">{score.reasons[0]}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <VerdictBadge verdict={score?.verdict ?? null} />
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
            disabled={scoring}
            onClick={() => onScore(posting.id)}
          >
            {scoring ? t("score.scoring") : score ? t("score.again") : t("score.now")}
          </button>
          <button
            type="button"
            className="text-xs text-slate-600 underline"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
          >
            {open ? t("row.hideDetails") : t("row.details")}
          </button>
        </div>
      </div>
      {scoreError ? (
        <div className="mt-2">
          <ErrorMessage error={scoreError} />
        </div>
      ) : null}
      {open ? (
        <div id={detailsId} className="mt-3 space-y-3 rounded bg-slate-50 p-3 text-sm">
          {score ? (
            <>
              <div>
                <h4 className="font-semibold">{t("row.reasons")}</h4>
                <ul className="list-inside list-disc">
                  {score.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
              {score.blockers.length > 0 ? (
                <div>
                  <h4 className="font-semibold">{t("row.blockers")}</h4>
                  <ul className="list-inside list-disc">
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
            <p className="text-slate-500">{t("row.noReasons")}</p>
          )}
          {isWebUrl(posting.url) ? (
            <a href={posting.url} target="_blank" rel="noreferrer noopener" className="text-blue-700 underline">
              {t("row.open")}
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
