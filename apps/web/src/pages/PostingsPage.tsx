import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { ErrorMessage } from "../components/ErrorMessage";
import { VerdictBadge } from "../components/VerdictBadge";

/** Minimal list for the skeleton (SDD-004 T1); filters, paging and scoring arrive in T2. */
export function PostingsPage() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["postings", {}], queryFn: () => api.listPostings({ pageSize: 25 }) });

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold">{t("postings.title")}</h2>
      {query.isPending ? <p>{t("postings.loading")}</p> : null}
      {query.isError ? <ErrorMessage error={query.error} onRetry={() => void query.refetch()} /> : null}
      {query.data ? (
        query.data.items.length === 0 ? (
          <p>{t("postings.empty")}</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-500">{t("postings.total", { count: query.data.total })}</p>
            <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
              {query.data.items.map((posting) => (
                <li key={posting.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-medium">{posting.title}</span>
                    <span className="text-slate-500"> · {posting.company}</span>
                  </span>
                  <VerdictBadge verdict={posting.latestScore?.verdict ?? null} />
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </section>
  );
}
